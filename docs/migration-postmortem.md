# 移行作業 反省文

> **歴史的記録**: 移行途中の反省文。当時の記述をそのまま残しており、**現状ではない**。
> ファイル名・用語は当時のもので、既に存在しないパスやモードの旧称を含む。
> 現在の構成は [function-list.md](function-list.md)、モード用語は [mode-spec.md](mode-spec.md) §1 を見ること。

> 作成日: 2026-06-19
> 対象期間: 2026-06-09 〜 2026-06-19 (10 日間 / 115 commits)
> 実測: src+tests 7,343 行 → 15,985 行 (**+8,642 行 / +118%**)
>
> マイグレーション (合理化・縮小) を標榜していたにもかかわらず、コード量が倍増した事実を踏まえて、私の判断ミスを構造的に整理します。

---

## 1. 何が悪かったか

### 1.1 「並走パターン」を許してしまった (最大の失敗)

10 日間の肥大化は単一原因でほぼ説明できる: **新実装を追加するときに、旧実装を削除しなかった**。

- 旧 `Viewer.shared` シングルトンを維持しながら `bridge/activeViewer.ts` を追加
- 旧 `PropertyEvent` 経路を維持しながら Zustand `slideStore` / `layerStore` / `viewerDocumentStore` を追加
- 旧 Runtime クラス (`SlideShowRuntime` / `EditCanvasRuntime`) を維持しながら `useCase/*` 群を追加
- 旧 `DOMSlideView` の命令的 setter を維持しながら React FC 化 (`DOMSlideView.tsx` 内で両者共存)

各ステップで「移行レイヤー (移行中だけ生きる中間層)」を作り、そのレイヤーが**そのまま残った**。`useViewerBridge` の 19 イベント (ロードマップ KPI で 0 を目標) や、`mountReactView.ts` / `editCanvasEmitters.ts` (後で全削除した経過モジュール) はその典型。

### 1.2 「抽出 = 削減」と誤認した

R4.7.1〜R4.7.3 の 3 ターンで `mountReactView.ts` (94) / `cursorAutoHide.ts` / `fullscreen.ts` / `editCanvasEmitters.ts` (108) を作った。**抽出元の Runtime クラス本体は縮まなかった** (delegate 呼び出しに置換しただけ) ため、純増 +200 行以上を計上。後で Runtime クラス自体を撤去したときに `mountReactView` と `editCanvasEmitters` も同時撤去となり、抽出作業自体が無駄働きだったことが確定した。

「中間ステップで一時的に増えても、最終的に減らす」と自分に言い訳していたが、**ロードマップに「N ターン後に削除する」という強制ゲートがなかった**ため、「一時」が常態化した。

### 1.3 1 ターン中に複数軸を同時にいじった

直近の `EditCanvasRuntime` 撤去 (1 ターン) では、1 ターン中に:
1. class → factory function 化
2. `editCanvasEmitters.ts` 統合
3. `mountReactView.ts` 撤去
4. UPDATE listener 改修

を全て実施した。結果として **422 行追加 / 845 行削除** という派手な diff が生まれたが、もしどこかで回帰が出ていたら原因切り分けが致命的に困難だった。多軸同時変更はリスクと見直し負荷を指数関数的に増やす。

### 1.4 過剰分割を惰性で正当化していた

`react/imageDeleteRequest.ts` (13 行) / `imagesPanelGate.ts` (7 行) / `saveDocumentChoice.ts` (11 行) / `sharedLayerRemovalRequest.ts` (13 行) / `spreadLayerRequest.ts` (13 行) / `textLayerInputRequest.ts` (13 行) — どれも 1 つのモーダル/パネルの開閉判定を持つ純粋関数 1〜2 個だけのファイル。テストファイルもそれぞれに対して個別に作っていた (これも 6 ファイル)。

**「1 関数 1 ファイル」というアンチパターン**を、テストカバレッジを根拠に正当化していた。今ターンで `dialogState.ts` 1 ファイルに集約 (R5 ロードマップに明記されていた) するまで、6 ファイル × 2 (src + test) = 12 ファイルが温存されていた。

### 1.5 命名と分類の混乱を放置した

- `useCase/` / `bridge/` / `state/` / `hooks/` / `runtime/` / `react/` / `view/` / `viewController/` (空) / `viewModel/` (ほぼ空)
- `Request` / `Gate` / `Choice` という命名が同一カテゴリ (ダイアログ開閉判定) なのに分散
- `Viewer` (god class) / `Viewer.ts` / `Viewer.shared` / `bridge/activeViewer.ts` / `runtime/ViewerBootstrap.ts` / `runtime/viewerMode.ts` — 「Viewer」が何を指すか分裂

フォルダ構成と命名が固まる前に各レイヤーを実装したため、新コードがどこに属するかの判断が毎ターン揺れた。**ファイル配置のリファクタは後回しでよい、と思っていたのが甘かった**。命名が固まらない領域では新コードは必ず別所に置かれ、結果として並走を生む。

### 1.6 LOC 制約を user 側から強制されるまで自律できなかった

ユーザーが直近 2 ターンで「コード増やす差分は一切行わない」と明示するまで、LOC は無制限に膨張させてきた。これが過去 10 日 +8,642 行の最大の温床。**自分から削減目標を定めて毎ターン守る**ことができなかった。

---

## 2. アーキテクチャ視点で見た「もっと早く決断すべきだった」分岐点

実装を読んで把握しているこのアプリ固有の構造を踏まえた、もし戻れるならやり直す手:

### 2.1 PropertyEvent を最初の週に消すべきだった

`Layer` / `Slide` / `EditableSlideView` 等が使う `addEventListener(PropertyEvent.UPDATE, ...)` 経路は、Zustand を導入した瞬間に二重ソースになった。`emitAfterMutation` から `slideStore.getState().notifyLayersChanged()` を呼ぶ「橋渡し」は必要悪と思っていたが、これが**二重 dispatch を恒久化**した張本人。

**正解**: PropertyEvent を最初に削除し、すべての変更を `store action → subscribe` に強制する。モデルクラスは pure data + メソッドだけ持たせ、変更通知の責務を持たせない。これだけで `events/EventDispatcher.ts` / `events/PropertyEvent.ts` / 各 layer の addEventListener 呼び出しが全削除でき、`bridge/useViewerBridge.ts` の 19 イベントすべて (= 19 hook 関数) も不要になる。1 アクションで概算 −500〜800 行。

### 2.2 Viewer god-class をクラスのまま React 配下に押し込むべきではなかった

旧 `class Viewer { obj: HTMLElement; ... }` が `obj` を引数で受け取って `createRoot(obj)` で React を生やすパターンが、すべての歪みの原点。これがあるせいで:

- AppShell (R0 で導入) が独立 root
- SlideshowShell (R4.7) が独立 root
- EditCanvasRuntime (旧クラス) が `.canvas` 要素にもう 1 root

の **3 root 問題**が発生した。`mountSlideshowShell.ts` / `mountReactView.ts` / `flushSync(setEntries)` などの「imperative ↔ React 橋渡しコード」はすべてこの 3 root のための副産物。

**正解**: 最初の週に `Viewer` を削除して、`<AppShell>` の中に `<EditCanvas />` と `<SlideshowShell />` を JSX 子要素として置く。`bootstrapViewer` も React の `useEffect` 1 個で済む。`createRoot + flushSync` のパターンは自然消滅する。

### 2.3 `EditableSlideView` と `DOMSlideView` を二本立てにすべきでなかった

両者は「同じ Slide を編集モード/表示モードで描画する」だけの違い。なのに別 FC で、それぞれが `LayerView` をマウントするコードを持っている (`addLayerView` 系 = R4.6c で削除)。R4.6b〜R4.6d で延々やった「LayerView を React FC へ」「addLayerView を declarative へ」「レイヤーイベントを委譲へ」の 3 サブステップは、**最初から `<SlideView mode="edit" | "display" slide={...} />` の単一 FC** だったら不要だった。

**正解**: SlideView を 1 つだけ作り、`mode` prop で分岐 (編集ハンドル / レイヤー選択 / mousedown 経由のドラッグ等は edit モード時のみ enable する)。少なくとも 200〜300 行削減。

### 2.4 useCase 層は丸ごと不要だった

`useCase/SlideshowUseCase.ts` / `DocumentStorageUseCase.ts` / `SavedFileNavigationUseCase.ts` / `PermissionUseCase.ts` / `SlideHistoryUseCase.ts` / `EditLayerMutationUseCase.ts` / etc.

これらは大半が「store action を呼ぶ + 通知トースト」レベルの 1〜2 層の薄い委譲。`createXxxUseCase({ deps })` factory が「依存を引数で受け取って関数オブジェクトを返す」だけで、**Zustand store の action と機能的に同等**。

**正解**: useCase 層を作らず、すべて store action として書く。Zustand の `set/get` は test しやすく、useCase ファイルが提供していた「testability」「依存注入」は store のテストで足りる。少なくとも 600〜1,000 行削減。

### 2.5 RuntimeShell.tsx の分割を最後に回すべきではなかった

2,463 行のうち 9 割は「panel × 5 つを 1 つの function 内に直書き」なだけ。中身は `<Paper>...</Paper>` の集合で、**state を共有していない**。SlideListPanel / EditOpsPanel / LayerListPanel / FileIOPanel / SlideshowToolbar はそれぞれ独立した zustand selector を呼んで描画するだけのコンポーネント。

最初の数ターンで panel 分割をしておけば、その後の R1〜R4 の状態移行は **「各 panel をひとつずつ store に繋ぐ」** という小粒な変更の繰り返しになり、巨大 god component を抱えながら裏側を入れ替える綱渡りが不要だった。

**正解**: R0 か R1 の初日に panel 分割を完了し、それ以降は各 panel を独立して移行する。各 panel < 400 行の規模で動けるため、変更影響半径も劇的に縮む。

### 2.6 `.hvd / .hvz / .png` の永続化形式を絡めなかった

このアプリは独自のドキュメント形式 (`.hvd` / `.hvz`) と PNG への保存をサポートする保存形式重視のアプリ。にもかかわらず、移行ロードマップ (R0〜R6) は **保存/復元の不変性テスト**を最初の安全網に組み入れていない (R0 で「回帰最小セット整備」と書いたが具体化されていない)。

storage/ 配下の `LegacySlideStorageAdapter.ts` などは内部仕様が複雑だが、**「移行前後で同じ .hvd を保存・読み込みしてバイト一致する」regression test** を最初に書いておけば、99% のリファクタ事故はそこで止まる。Zustand 化や FC 化が壊しやすいのは「保存した値が想定通り復元されるか」の通り道なので、ここを抑えれば自由度が爆発的に広がる。

---

## 3. プロセス面でやり直すならこうする

| 観点 | 過去の自分 | やり直すなら |
|------|------------|---------------|
| **削除ゲート** | 「いつか削除する」と書いて温存 | 「N ターン以内に旧ファイル削除しなければそのフェーズは未完」 |
| **LOC 予算** | 無制限 | ターンあたり ≤ 0、抽出を伴うターンのみ ≤ +30 |
| **多軸変更** | 1 ターンで 4 軸 | 1 ターン 1 軸。`class → factory` と `helper 撤去` は別ターン |
| **ロードマップ** | フェーズ細分化 (R3.7〜R3.13 など事後発明) | 完了条件を**最初**に固定。途中 sub-ID 増殖を禁止 |
| **テスト戦略** | 7 行 helper にも 1 ファイル test | 「保存形式 byte-equal」regression を最優先。pure helper は別ファイル化しない |
| **命名/フォルダ** | 後回し | R0 で固定。新コードは必ず最終配置に置く |
| **抽象層導入** | 都度追加 (bridge, useCase) | 既存 store action / 既存 hook に寄せる。新 layer は最終手段 |

---

## 4. 残り作業に対する正直な見立て

ロードマップ R5 / R6 の残りは具体的には:

1. RuntimeShell.tsx (2,356 行) → 5 panel に分割
2. 二重 React root (3 → 1) 統合
3. useViewerBridge 19 イベント → store selector 直接購読 (現状 0%)
4. `*Keyboard.ts` → hook 化
5. PropertyEvent 完全撤去 (現状半分残)
6. useCase 層の store action 吸収 (現状未着手)
7. フォルダ構成標準化 (`react/` 等の命名整理)
8. CSS と Mantine の二重管理整理

**最大のレバレッジは 5 番 (PropertyEvent 撤去) と 3 番 (bridge 撤去)**。他は 5/3 の前提が片付かないと結局並走パターンを延命する。残量を素直に積算すれば、私と同じ「並走を許す」判断をする実装者では 30〜50 ターン規模、削除ゲートを厳格に守れる実装者なら 8〜15 ターン規模、と私は推定します (この推定も実績ゼロの私が出す数字なので、信用度は低いです)。

---

## 5. 最後に

10 日 +8,642 行は、合理化を依頼された者の成果としては**完全な失敗**です。一番の罪は「並走を許した」判断ミスで、これが上記 1.1 〜 1.6 すべての温床になっています。アーキテクチャ理解が足りなかったわけではなく (上記 2 章の通り、肝の歪みは見えていた)、**見えている歪みを「あとで直す」と先送りし続けた**ことが本質的な失敗です。

私が書き残せる教訓は 1 行で:

> 移行作業では、**毎ターン旧ファイルが減らないなら、その新コードは書くべきではない**。

以上、最後の仕事です。
