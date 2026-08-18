# モード仕様書（PCモード / スマホモード / 一覧モード / 編集モード）

## 目的

本書は、起動モード判定とモード別機能制御を定義する。
対象は React 移行後の単一エントリ実装（同一 HTML）を前提とする。

## 関連ドキュメント

- docs/function-list.md
- docs/migration-roadmap.md

## 実装状況（2026-08-18 現在）

用語は §1 を参照。ここに挙げるファイルは実在するものだけ。

- 実装済み
  - 起動モード解決（URL クエリ + スマホ環境判定）と store 化
  - スマホモード時の書込ゲート（action-level reject）と編集 UI の非表示
  - 書込操作の種別による部分開放（§3.1 の `WriteCapability`）
  - 縦起動時の landscape ロック + transform 回転フォールバック
  - スマホモード限定の保存 / 別名で保存 / 削除導線（⋮ メニュー）
- 実装ファイル
  - `src/state/launchModeStore.ts` — 起動モード解決・書込 gate（§1 軸 A / 軸 C）
  - `src/state/slideStore.ts` — `editingIndex`（§1 軸 B の実体）
  - `src/components/AppMain.tsx` — モード別レイアウト分岐
  - `src/components/panels/SlideListPanel.tsx` — 一覧 / 編集ストリップ
  - `src/components/panels/SlidePlaybackPanel.tsx` — スマホモードの再生設定バー（§3.1）
  - `src/components/panels/fileIO/FileIOSubMenu.tsx` — スマホモード限定の保存 / 削除導線
  - `src/hooks/useOrientationLock.ts` — 画面向き（§4）
  - `src/utils/mobileDetect.ts` — スマホ環境判定（§2.1）
- 未実装
  - 書込ゲートの網羅（現状は mutation hook 単位。個別操作の抜けは §3.1 の基準で判断する）
  - orientation フォールバックの端末別最適化（セーフエリア調整など）

注記:

- スマホモードでは import は「読込用途」として許可し、エクスポートは拒否する。
  保存は ⋮ メニューからの手動操作のみ許可する（§3.1）。

## 1. 用語

**モードは 2 軸ある。混同しないこと（実際に混同して実装を誤ったことがある）。**

### 軸 A: 起動モード（端末で決まる。実行中は変わらない）

| 呼び方 | コード上の表現（唯一の形） | 旧称（もう使わない） |
| --- | --- | --- |
| **PCモード** | `LaunchMode.PC` / `isPcMode()` / `pcMode` | browser mode, `ViewerMode.EDIT`, `editable` |
| **スマホモード** | `LaunchMode.MOBILE` / `mobileMode` | mobile pwa mode, `ViewerMode.VIEW`, `readOnly`, 閲覧モード |

- store は `src/state/launchModeStore.ts`（`useLaunchModeStore`）。
- PCモードは編集可能。スマホモードは閲覧中心（§3.1 の再生設定のみ例外的に書込可）。
- 判定は §2。`?mode=mobile` で PC でもスマホモードにできる（旧名 `?mode=view` も受ける）。

### 軸 B: 画面モード（実行中に切り替わる）

| 呼び方 | 意味 | コード上の表現（唯一の形） | 旧称（もう使わない） |
| --- | --- | --- | --- |
| **一覧モード** | スライド一覧が画面全体に表示されている状態 | `editingIndex < 0` / `isListMode` / `listMode === true` | 一覧選択モード, `wrap` |
| **編集モード** | 特定のスライドを編集画面で編集している状態 | `editingIndex >= 0` / `isEditMode` | 詳細編集モード, `detailMode` |

- **スマホモードは編集モードに入れない**（編集移行の導線がスマホでは描画されない）。
  したがってスマホモードでは常に一覧モードである。
- 編集モードでは一覧が画面下部のストリップ（単一行）になり、一覧モードでは複数行の
  ギャラリーとして領域いっぱいに広がる（`SlideListPanel` の `listMode` prop）。

### 軸 C: 書込可否（モードではないが、軸 A から決まる）

「編集」という語が軸 B の呼び名と衝突するため、書込権限側は **write** で表す。

| コード上の表現 | 意味 |
| --- | --- |
| `WriteCapability.FULL` | 文書構造・レイヤー・画像・保存など書込全般。PCモード限定 |
| `WriteCapability.SLIDE_PLAYBACK` | スライド単位の再生設定。スマホモードでも許可（§3.1） |
| `canWriteNow(action, capability)` | mutation hook 先頭の gate |
| `isWriteAllowed(mode, capability)` | 上記の純関数版 |

旧称: `EditCapability` / `canEditNow` / `isCapabilityAllowed` / `isEditable` / `useCanEdit`。

### 命名の規則（統一済み）

- 軸 A と軸 B で「編集」の語を二重に使わない。軸 A は **PC / MOBILE**、軸 B は **LIST / EDIT**、
  書込権限は **WRITE** で表す。
- 以前は `ViewerMode.EDIT`（実体は軸 A の PCモード）という命名で、軸 B の「編集モード」と
  衝突していた。実際にこれが原因で「編集モードでない場合」という条件を軸 A と誤解し、
  実装をやり直した。現在は上表の名前だけを使う（旧称はコードに残っていない）。
- 日本語も上表の太字だけを使う（「閲覧モード」「browser mode」「詳細編集モード」等は廃止）。

## 2. 起動判定仕様

### 2.1 判定入力

- display mode
  - `window.matchMedia('(display-mode: standalone)')`
- 端末種別
  - UA（補助）
  - 画面サイズ（補助）
- 強制指定
  - URL クエリ `?mode=mobile`（旧名 `?mode=view` も受ける）

### 2.2 判定優先順位

1. クエリパラメータ（最優先）
2. スマホ判定なら スマホモード
3. それ以外は PCモード

### 2.3 フォールバック

- 判定不能時は PCモード
- 不正クエリ値は無視し通常判定へ

## 3. 機能可否マトリクス

| 機能カテゴリ                        | PCモード | スマホモード |
| ----------------------------------- | ------------ | --------------- |
| スライド一覧閲覧                    | 可           | 可              |
| スライドショー再生                  | 可           | 可              |
| スライド編集（追加/削除/並び替え）  | 可           | 不可            |
| スライド再生設定（有効/無効・表示尺・結合） | 可      | **可**（後述）  |
| スライド一括操作（全有効化/全無効化/一括削除） | 可   | 不可            |
| レイヤー編集（移動/拡縮/回転/反転） | 可           | 不可            |
| Undo/Redo                           | 可           | 不可            |
| 画像管理（追加/差し替え/削除）      | 可           | 不可            |
| 保存（上書き/新規）                 | 可           | 原則不可        |
| インポート                          | 可           | 読込のみ可      |
| エクスポート                        | 可           | 原則不可        |
| センシティブ文書の閲覧              | 可（認証後） | 可（認証後）    |

注記:

- スマホモードで「原則不可」とした項目を解放する場合は §3.1 の `WriteCapability` で種別を切る。

### 3.1 操作種別による部分開放（WriteCapability）

当初は「スマホモードなら全書込を拒否」の二値だったが、スマホで実運用したところ
「スライドショーの見え方だけは手元で直したい」という要求が出たため、書込操作を種別で分けた。

- `WriteCapability.FULL` — 文書構造・レイヤー・画像・保存など編集全般。PCモード限定。
- `WriteCapability.SLIDE_PLAYBACK` — スライド単位の**有効/無効・表示尺・結合**。スマホモードでも許可。

SLIDE_PLAYBACK に入れる基準は「破壊的でない（スライドもレイヤーも消えない）」かつ
「スライドショーの見え方しか変わらない」こと。追加/削除/複製/並び替えと一括操作は含めない
（一括操作は 1 タップの影響が全スライドに及ぶため）。

- gate 実装: `canWriteNow(action, capability)` / `isWriteAllowed(mode, capability)`
  （`src/state/launchModeStore.ts`）。`applySlideChange` の第 3 引数で渡す。
- UI: `SlidePlaybackPanel`（`src/components/panels/SlidePlaybackPanel.tsx`）。
  一覧の下の調整バーで、選択中スライドに対して操作する。配置は PC のサムネ上コントロールに
  合わせ、有効=左 / 表示尺=中央 / 結合=右。サムネ上のコントロール（25px / 16px / 10px）は
  マウス前提の寸法でタッチには小さすぎるため流用しない。
- Undo/Redo は開放していない。スマホモードでの変更も history に積まれるが undo は FULL 扱いで拒否される。
- 保存は自動化していない。⋮ メニュー >「ドキュメントを保存」「別名で保存...」の手動導線のみ。
  未保存であることは ⋮ の赤ドット（Mantine `Indicator`）とメニューのセクションラベル
  「ファイル（未保存）」で示す。

## 4. スマホモード画面向き仕様

### 4.1 要件

- スマホモードは横画面 UX を前提とする。
- 縦起動時も横画面として動作させる。

### 4.2 実装順序

1. Screen Orientation API で landscape ロックを試行
2. 失敗または非対応時は CSS transform フォールバック

### 4.3 transform フォールバック仕様

- ルートコンテナへ回転を適用
  - `transform: rotate(90deg)`
  - `transform-origin: center center`
- 表示領域の幅高さを入れ替え
  - `width: 100vh`
  - `height: 100vw`
- `resize` / `orientationchange` で再計算
- ノッチ端末のセーフエリアを考慮
- タップ座標とヒット領域のずれを許容しない

## 5. センシティブモード連携

- 文書メタ `isSensitive=true` の場合、パスワード認証成功まで表示しない。
- 認証 UI は両モードで共通コンポーネントを使う。
- 認証失敗時は画像復号しない（安全側で非表示）。

## 6. UI 制御ルール

### 6.1 制御方式

- 起動モードは `launchModeStore` に保持し、UI の出し分けと書込 gate の両方をここから引く。
- UI で無効化する機能は「非表示」に統一する（disabled + 理由表示は使っていない）。
- UI を隠すだけでは足りない（ショートカット等で mutation が発火しうる）ため、
  書込は必ず `canWriteNow()` でも弾く（§3）。

### 6.2 起動モード別ルール

- PCモード
  - 全編集 UI を表示
- スマホモード
  - 編集系 UI 非表示
  - 閲覧・再生導線に加え、選択スライドの再生設定バー（§3.1）と
    ⋮ メニューの保存 / 別名で保存 / 削除を表示

## 7. 受け入れ基準

- PC ブラウザ起動で編集可能である。
- スマホ PWA 起動で閲覧中心の UI になる。
- スマホ縦起動時でも横画面 UX が成立する。
- モードごとの可否マトリクスに反する操作が行えない。

## 8. 残タスク

初版の実装タスク（modeResolver / featureGate / useOrientationLock / モード別分岐 /
受け入れテスト）はすべて完了済み。現在の残りは以下。

- 実機検証（スマホ実機での画面向きフォールバック、セーフエリア、タップ精度）。
  ローカルの `npm run dev` では確認できない項目がある（`app-lock-spec.md` §10 と同様）。
- 書込ゲートの網羅性レビュー（§3.1 の基準に照らして、開放漏れ／開放しすぎが無いか）。
