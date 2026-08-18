# 移行ロードマップ v4 (Forward-only build 版)

> **歴史的記録**: 移行 v4 の計画書。forward-only build 方針で、これに沿って完了した。当時の記述をそのまま残しており、**現状ではない**。
> ファイル名・用語は当時のもので、既に存在しないパスやモードの旧称を含む。
> 現在の構成は [function-list.md](function-list.md)、モード用語は [mode-spec.md](mode-spec.md) §1 を見ること。

> 作成日: 2026-06-20
> 起点コミット: `cae71b14` (2026-06-20、v3 Group A swap 復元 + Group B build 1-8 完了状態)
> 旧 v3 ([migration-roadmap-v3.archived.md](migration-roadmap-v3.archived.md)) は Strangler fig + per-Group swap 方針で稼動した結果、実装してみて「**新側を継続構築する方がコードが clear になる**」とユーザ判断 (2026-06-20)。本書はその方針転換を反映した版。

---

## 0. 方針転換の理由 (v3 → v4)

v3 は **swap chunk 単位の原子性** (build 1-5 ターン + swap 1 ターン) を鉄則としていたが、Group A swap (`7d3b7798`) を実施した直後に「レガシー側で当該機能が動かなくなる」「import 文 surgery で Viewer.ts に手が入る」副作用が発生し、`2a30c72e` で swap 自体を巻戻した経緯がある。

実際に Group A〜B を build したユーザ判断 (2026-06-20): **「切り出しやすいパーツを再構築 → レガシーに SWAP のループ」よりも、「新側を継続構築してレガシーは触らず最後にバルク削除する」方が、結果として新側コードが clear になる**。

v4 では:

**転換 1: per-Group swap を廃止**

- 各 Group は **build のみ**。レガシー側は一切触らない (`Viewer.ts` surgery / `viewController/*` 削除 / `index.ts` 編集すべて禁止)
- レガシー側はそのままで全機能維持 (= `index.html` の現行 entrypoint で起動すると従来通り動作)
- 新側は `?new=1` の dual entrypoint (`src/main-new.tsx`) で段階的に動作確認
- レガシー一式の物理削除と entrypoint 統合は **Group D 完了後の独立フェーズ「Group E: 最終 bulk delete」** で一括実施

**転換 2: §0-1 (swap chunk 5 ターン上限) 撤廃**

- build フェーズの長さに制約を設けない。Group ごとに「build 完了条件」のみ満たせばよい
- ターン数の絶対値より「新側 component の機能 parity が仕様書ベースで満たされていること」を成否指標とする

**転換 3: §0-3 (レガシー編集禁止) を全期間に拡大**

- v3 では「build 中は禁止、swap 内の import surgery のみ例外」だったが、v4 では **swap 自体が無いため例外も無い**
- レガシー側ファイル (`view/` `viewController/` `viewModel/` `Viewer.ts` `index.ts` `model/` `events/` `interface/` + utils 内 stateful クラス) は **全期間 Group E まで読み取り専用**

**継承される v3 の鉄則** (v4 でもそのまま):

- §0-2 中間層・新規抽象層禁止
- §0-4 1 ターン 1 軸
- §0-7 抽出のみのターン禁止 / 1 関数 1 ファイル禁止
- §0-8 dual entrypoint (`src/index.ts` + `src/main-new.tsx`)
- §0-9 parity 方針 = b (HVD byte-equal + UI 仕様書ベース)
- §0-10 新側内製の原則 (レガシークラス import 禁止、stateful クラスは hook / store action / 純関数で再実装)
- Group 単位 A/B/C/D は固定 (vertical slice 順)
- agent によるサブ ID 即興発明禁止、roadmap 構造の独断改変禁止、KPI 緩和の独断禁止

---

## 1. 起点と終点

### 起点 (`cae71b14`, 2026-06-20)

- src 合計: ~8,331 行 (新側 build 累積 +1,500 行を含む。レガシー側は起点 c1936d80 から無編集で維持)
- tests: 28 件 pass (storage round-trip + storageCodec + useStorage + slideshow component)
- v3 で実施済:
  - Group A: 新側 rendering chain (`components/slide/SlideView.tsx` + `components/layer/LayerView.tsx` + `components/layer/LayerContent.tsx` + `components/SlideshowShell.tsx` + `src/main-new.tsx`) build 完了
  - Group A swap (`7d3b7798`) は実施したが副作用で巻戻し (`2a30c72e`)。**Group A の build 成果物はそのまま残存し、v4 では swap は不要 (Group E で一括処理)**
  - Group B: build 1-8 完了 (`storageCodec.ts` / `useStorage.ts` / `useFileIO.ts` / `slideThumbnail.ts` / `viewerDocumentFactory.ts` / `FileIOPanel.tsx`)
- React 18 / Zustand 5 / Mantine 7 / TypeScript 5.6 導入済

### 終点 (KPI、v3 から継承)

> **改訂 (2026-07-14, closeout §2.1)**: LOC 目標 `< 6,500` は初期見積り誤りにより非現実的だった (実測: Group E 完了時点 src 11,250 + tests 10,603 = 21,853 行)。**LOC KPI は終点条件から除外**し、構造条件 (jQuery 0 / EventDispatcher 0 / view+viewController+viewModel 全削除 / createRoot 1 個) のみを終点判定に採用する。数字合わせでコードを削るのは本末転倒。

| 指標 | 起点 | 目標 |
|---|---|---|
| ~~src+tests 合計行数~~ | ~~~8,400~~ | ~~**< 6,500** (Group E の bulk delete 後)~~ → **KPI から除外** (実測 21,853 で fix、以後は自然増減) |
| jQuery 利用ファイル | 4 (`index.ts` / `Viewer.ts` / `view/slide/EditableSlideView.ts` / `utils/LayerViewFactory.ts`) | **0** |
| `EventDispatcher` / `PropertyEvent` 参照 | 数十 | **0** |
| `innerHTML` 直書き | 0 (起点維持) | **0** 維持 |
| `Viewer.ts` god-class | 332 行 | **削除** |
| `viewController/` フォルダ | 7 ファイル | **削除** |
| `viewModel/` フォルダ | 1 ファイル | **削除** |
| `view/` フォルダ | 11 ファイル | **削除** |
| `EditableSlideView` + `DOMSlideView` + `ThumbSlideView` + `CanvasSlideView` + `SlideView` | 5 ファイル | **1 (`components/slide/SlideView.tsx` mode prop)** |
| `createRoot()` 呼び出し数 | 1 (`src/main-new.tsx`) | **1 (`src/main.tsx` のみ、Group E で `index.ts` 削除 + リネーム)** |
| `bridge/` `useCase/` `runtime/` `react/` `*Adapter` `*Manager` フォルダ・命名 | 不在 | **作らない** |
| regression test | 28 件 | **+ 各新 component の round-trip / 主要操作 test を build と同期で追加** |

---

## 2. 鉄則 (毎ターン守る)

### §0-1. build-only ターン (v4 で改訂)

各 Group (A/B/C/D) は **build のみ**で構成する。per-Group swap は廃止。**ターン数の上限は設けない**が、Group ごとに「§3 build 完了条件」を満たすこと。

レガシー一式の物理削除と entrypoint 統合は **Group E (最終 bulk delete)** で一括実施。Group A〜D 中は `git rm` 系のレガシー削除コマンド一切禁止。

### §0-2. 中間層・新規抽象層禁止 (v3 §0-2 継承)

新側で以下のフォルダ・命名は作らない: `bridge/` `useCase/` `runtime/` `react/` `*Adapter` `*Manager` `*Factory` (※既存 `utils/LayerViewFactory.ts` は Group E で削除対象)。
最終フォルダ構成は **`components/` `hooks/` `state/` `types/` `utils/` `events/` (Group E まで暫定) のみ**。`hooks/` は zustand selector を束ねる薄い hook 専用。FC は store を直接購読する。

### §0-3. 全期間レガシー編集禁止 (v4 で強化)

以下を **Group E 着手まで読み取り専用**: `src/view/` `src/viewController/` `src/viewModel/` `src/Viewer.ts` `src/index.ts` `src/utils/LayerViewFactory.ts` `src/utils/KeyboardManager.ts` `src/utils/HistoryManager.ts` `src/utils/DropHelper.ts` `src/utils/ImageManager.ts` `src/utils/SlideStorage.ts` `src/events/` `src/model/` `src/interface/`。仕様参照のみ。
v3 にあった「swap コミット内の import 文除去のみ例外」条項は **v4 では適用なし** (swap が無いため)。

### §0-4. 1 ターン 1 軸 (v3 §0-4 継承)

build ターンは「1 component または 1 関連責務の build 1 ステップ」のみ。複数の独立変更を同一ターンで実施しない。

### §0-5. LOC 帳簿 (v4 で改訂)

毎ターン末に以下を報告:

```
build ターン:           legacy ±0, new +N, total +N (LOC 負債として計上、Group E で回収)
Group E 削除ターン:     legacy -M, new ±α, total -(M-α) (一括回収)
```

**Group A〜D 中は total が単調増加する**前提 (build only のため)。~~**Group E 完了時点で total が起点比 < 6,500 行**~~ → 2026-07-14 KPI から除外 (§1 改訂参照)。中間で total を負増させる調整 (= レガシー削除) は §0-3 違反扱い。

build ターンの LOC 正増は事前承認不要 (v3 から継承)。報告のみ義務。~~承認必須は KPI そのものの緩和 (最終終点 < 6,500 行 / byte-equal 等) のみ。~~ → LOC KPI 除外に伴い、承認必須は byte-equal 等の構造判定緩和のみ。

### §0-6. test 同期追加 (v4 で明文化)

各 build ターンで追加した新 component / hook / 純関数について、**同一ターン or 直後のターンで vitest を追加**する。「後でまとめてテスト書く」は禁止。test なしで完了報告した build ターンは未完扱い。

各 Group の「build 完了条件」(§3 参照) には「新 component の単独 vitest 追加」が必須項目として含まれる。

### §0-7. 抽出のみのターン禁止 (v3 §0-7 継承)

新コードを「後で使うかも」と先んじて helper に切り出さない。1 関数 1 ファイル禁止。新ファイルは最低 30 行・複数の関連責務を持つこと。

### §0-8. dual entrypoint (v3 §0-8 継承)

- `src/index.ts` (現行、レガシー): `new Viewer(...)` でレガシーをマウント (§0-3 により Group E まで編集禁止)
- `src/main-new.tsx`: `?new=1` クエリ時のみ `createRoot(<AppShell />)` でレガシーを bypass
- 両者は同一 zustand store を共有 (新側でロード/保存テストが実行可能)
- レガシー側はそのままで全機能維持 (新側未実装の機能はレガシー側で操作する)
- **Group E で `src/index.ts` を削除し `src/main-new.tsx` を `src/main.tsx` にリネーム、createRoot を 1 個に**

### §0-9. parity 方針 = b (v3 §0-9 継承)

- **HVD/HVZ/PNG 永続化形式は byte-equal 厳密** (memory 行 32-33 規約遵守、postmortem §2.6)
- **UI 操作は仕様書ベース**: [docs/function-list.md](function-list.md) / [docs/mode-spec.md](mode-spec.md) / [docs/sensitive-mode-spec.md](sensitive-mode-spec.md) / [docs/data-compatibility-spec.md](data-compatibility-spec.md) に明記された挙動を再現。pixel-perfect (cursor 形状の細部等) は不問
- 「機能だけある程度」を口実にした仕様逸脱は禁止。仕様書記載の挙動は必須

### §0-10. 新側内製の原則 (v3 §0-10 継承)

新側 component は **レガシークラスを import してはならない**。新側で必要な機能はその Group の build フェーズで新規実装する。stateful なレガシークラス (EventDispatcher 派生 / jQuery 利用 / シングルトン保持) は **hook / store action / 純関数のいずれか**として再実装する (class インスタンスは廃)。

**import 禁止** (stateful レガシークラス全般):

| ファイル | 理由 | 新側での再実装先 |
|---|---|---|
| `src/view/**` | 神 component + 派生 view クラス、jQuery / EventDispatcher | `components/slide/SlideView.tsx` + `components/layer/*.tsx` (Group A〜D で段階構築) |
| `src/viewController/**` | jQuery / EventDispatcher | `components/panels/*.tsx` + `components/SlideshowShell.tsx` (Group A〜D) |
| `src/viewModel/VMUI.ts` | class シングルトン | store action + AppShell の `useEffect` (Group D) |
| `src/Viewer.ts` / 現行 `src/index.ts` | god class + jQuery bootstrap | `src/main-new.tsx` → 最終 `src/main.tsx` (Group E) |
| `src/model/**` | EventDispatcher 派生 class | `src/types/**` 純粋型 (済) + store action |
| `src/events/**` / `src/interface/**` | EventDispatcher / 旧 OO interface | 不要 (zustand 購読で代替) |
| `src/utils/LayerViewFactory.ts` | jQuery | 廃止 (FC 化で不要、Group E) |
| `src/utils/KeyboardManager.ts` | EventDispatcher class | `hooks/useShellKeyboard.ts` (Group D) |
| `src/utils/HistoryManager.ts` | EventDispatcher class | `hooks/useHistory.ts` + store action (Group D) |
| `src/utils/DropHelper.ts` | EventDispatcher class | `hooks/useDrop.ts` (必要 Group で) |
| `src/utils/ImageManager.ts` | jQuery class | `hooks/useImageLibrary.ts` (Group B/D) |
| `src/utils/SlideStorage.ts` | EventDispatcher class シングルトン | **`hooks/useStorage.ts` + 純関数 codec** (Group B 完了済) |

**import 可** (pure 静的ヘルパー、jQuery / EventDispatcher / class インスタンス状態を持たない):

- `src/types/**` (純粋型、既に確立)
- `src/state/**` (zustand store、既に確立)
- `src/utils/DataUtil.ts` / `src/utils/DateUtil.ts` / `src/utils/PNGEmbedder.ts` / `src/utils/SlideToPNGConverter.ts` / `src/utils/TypeChecker.ts` (静的ヘルパー)
  - 現状は class 構文だが静的メソッドのみで lifecycle 持たず。新側 import 時点では現状形で使用可。Group E 末尾で純関数化検討

**戦略的価値** (v3 から継承):

vertical slice で各 Group が新側だけで完結することで、**新側 component / hook / store が漸進蓄積される**。Group A の rendering chain → Group C で `mode="thumb"`、Group D で `mode="edit"` 拡張により再利用される。Group B の `hooks/useStorage.ts` + 純関数 codec → Group C/D で再利用される。

---

## 3. Group カタログ (vertical slice 順、Group ID 固定)

機能的に切り離せる縦スライスから着手する。**以下表の Group ID (A/B/C/D/E) は固定**。Group 内のステップ分割は Group 着手時に todoList で宣言する。サブ ID を agent が build 中に発明することは禁止 (memory 行 16, 18 / 反省文 §3)。

### Group A. SlideShow (build 完了済、v3 で実装)

スライドショーは全画面表示の読み取り専用モード。編集状態と独立。

**build 成果物** (v3 で実装、v4 でもそのまま継承):

- `components/slide/SlideView.tsx` (初版 = 読み取り専用描画コア、`mode` prop 未追加)
- `components/layer/LayerView.tsx` (レイヤー描画コンテナ FC)
- `components/layer/LayerContent.tsx` (image / text discriminated union ディスパッチ)
- `components/SlideshowShell.tsx` (全画面シェル + Mantine + next/prev/auto-advance)
- `src/main-new.tsx` + クエリ `?new=1` 振り分け
- vitest: `tests/components/slideshow.test.tsx`

**v4 では「Group A 完了」と認定**。レガシー `viewController/SlideShowViewController.ts` の削除は Group E に回す。

### Group B. ViewerDocumentIO (build 1-8 完了済、残タスク 1 件)

ドキュメントレベルのロード/セーブ/インポート/エクスポート + 画像ライブラリ。

**build 成果物** (v3 で実装):

- `src/utils/storageCodec.ts` (HVD/HVZ/PNG 純関数 codec)
- `src/utils/slideThumbnail.ts` (PNG export 用 thumbnail 生成、legacy SlideToPNGConverter 相当の pure 再実装)
- `src/utils/viewerDocumentFactory.ts` (新規 ViewerDocument 生成 factory、ディスプレイサイズ取得込み)
- `src/hooks/useStorage.ts` (IDB アクセス + codec 統合 hook、legacy SlideStorage 相当)
- `src/hooks/useFileIO.ts` (import / export hook、store 疎結合 = doc / imageMap 引数注入)
- `src/components/panels/FileIOPanel.tsx` (新規 / 開く / 保存 / 削除 / import / export UI)
- vitest: `tests/storageCodec.test.ts` / `tests/storage.roundtrip.test.ts` / `tests/hooks/useStorage.test.tsx`

**残タスク** (Group B build 完了の最終ステップ、§0-6):

- `tests/hooks/useFileIO.test.tsx` 追加 (FileIOPanel 経由 = useFileIO の `importFile` → `exportHvd/Hvz/Png` で HVD/HVZ/PNG round-trip 1 周回す統合テスト)

レガシー `src/viewController/file/FileSelector.ts` + `src/utils/SlideStorage.ts` の削除は Group E に回す。

### Group C. SlideList

スライドサムネイル一覧 + 進捗表示 + 並び替え。

**build スコープ**:

- `components/panels/SlideListPanel.tsx` (並び替え含む、Mantine)
- `components/slide/SlideView.tsx` に `mode="thumb"` 拡張 (canvas 描画 / 縮小表示)
- `components/ProgressBar.tsx` の useEffect で進捗表示吸収 (既存 ProgressBar は v2 P2 で済)
- 必要なら `hooks/useSlideList.ts` (並び替え操作)

**build 完了条件**:

1. 機能 parity (§0-9): スライド一覧 / サムネイル表示 / 並び替え / 進捗表示が仕様書通り
2. `?new=1` で手動動作確認
3. `tests/components/slideList.test.tsx` 追加 (一覧表示 + 並び替え操作 + store 反映)
4. tsc --noEmit error 0

レガシー `viewController/ListViewController.ts` + `ProgressViewController.ts` + `view/slide/ThumbSlideView.ts` + `view/slide/CanvasSlideView.ts` の削除は Group E。

### Group D. Edit (最も冗長で神 component を含む)

編集画面、レイヤー操作、ドラッグ/ドロップ、キーボード、コマンド履歴。サイズ上 Group 内で複数ステップに分割し、順次 build する。**詳細ステップ分割は Group D 着手時に todoList で宣言**する (Group A/B/C で学んだ値を反映させるため事前詳細設計はしない)。

**build スコープ** (Group D 着手時に確定):

- `components/panels/LayerListPanel.tsx` + `components/panels/EditOpsPanel.tsx`
- `components/slide/SlideView.tsx` に `mode="edit"` 拡張 (ハンドル/ドラッグ/レイヤー選択 UI)
- `components/layer/AdjustView.tsx` (image 編集ハンドル)
- `hooks/useShellKeyboard.ts` / `hooks/useHistory.ts` / `hooks/useDrop.ts` / `hooks/useImageLibrary.ts` 等
- AppShell の Edit mode 統合

**build 完了条件**:

1. 機能 parity (§0-9): 仕様書記載の全 Edit 操作 (レイヤー追加/削除/移動/回転/拡縮、テキスト入力、画像ライブラリ、undo/redo、キーボードショートカット、ドラッグ&ドロップ) が新側で動作
2. `?new=1` で手動動作確認 (全機能)
3. 各 component / hook の vitest 追加 (操作 → store 反映)
4. tsc --noEmit error 0
5. レガシー側との挙動差分が仕様書に矛盾しないことの確認

### Group E. 最終 bulk delete + entrypoint 統合 (v4 で新設)

Group D の build 完了条件をすべて満たしてから着手する独立フェーズ。**Group E 内で初めて legacy 削除と Viewer.ts surgery を許可する** (§0-3 例外)。

**Group E スコープ**:

- レガシー一式の物理削除:
  - `src/viewController/` 全ファイル (7 件)
  - `src/viewModel/VMUI.ts`
  - `src/view/` 全ファイル (11 件、`SlideView` base / `DOMSlideView` / `EditableSlideView` / `ThumbSlideView` / `CanvasSlideView` / `LayerView` base / `layer/AdjustView` / `layer/ImageView` / `layer/TextView` / `ProgressBar`)
  - `src/Viewer.ts` / 現行 `src/index.ts` (jQuery bootstrap)
  - `src/events/` 全ファイル (EventDispatcher / PropertyEvent)
  - `src/model/` 全ファイル (Layer / Slide / ViewerDocument class 群)
  - `src/interface/` 全ファイル (IDroppable / IVMUI)
  - `src/utils/LayerViewFactory.ts` / `KeyboardManager.ts` / `HistoryManager.ts` / `DropHelper.ts` / `ImageManager.ts` / `SlideStorage.ts`
- entrypoint 統合: `src/main-new.tsx` を `src/main.tsx` にリネーム、`index.html` の `script src` 更新、`?new=1` 振り分けを撤去
- `src/utils/` 静的ヘルパー (DataUtil / DateUtil / PNGEmbedder / SlideToPNGConverter / TypeChecker) の純関数化検討 (任意)
- 全 test pass + tsc --noEmit error 0 + manual smoke test

**Group E 完了 = §1 終点 KPI 達成**: createRoot 1 個 / jQuery 0 / EventDispatcher 0 / view+viewController+viewModel フォルダ全削除 (~~src+tests < 6,500 行~~ → LOC は KPI 除外、§1 改訂参照)。

---

## 4. ターンテンプレート

### build ターン (Group A〜D)

```
1. ターン開始: git diff HEAD --stat で前ターン累積を確認
2. 着手 step を 1 つ宣言 (複数禁止 §0-4)
3. 新ファイル追加・編集のみ (レガシー一切触らない §0-3)
4. 該当 step に対応する vitest を同一 or 直後ターンで追加 (§0-6)
5. 検証: tsc --noEmit --skipLibCheck + 既存全 test pass + ?new=1 で手動確認
6. ターン末: legacy 0 / new +N / total +N (LOC 負債計上 §0-5) を報告
7. todoList 更新
```

### Group E 削除ターン

```
1. ターン開始: Group D build 完了条件 5 つの達成を再確認
2. 削除対象を宣言 (複数ファイルまとめて 1 コミット可、§0-4 は v4 では Group A〜D のみ適用)
3. 同一コミット内で:
   a) レガシーファイル rm
   b) index.html の script src 切替
   c) src/main-new.tsx を src/main.tsx にリネーム
   d) 不要 import 検出 (tsc / 手動)
4. 検証: tsc --noEmit --skipLibCheck + 全 test pass + ?new=1 振り分け撤去後の動作確認
5. ターン末: legacy -M / new +α / total -(M-α) を報告 (§0-5)
6. todoList の Group E を completed にマーク
```

---

## 5. 禁止事項

- **新規抽象層作成**: `bridge/` `useCase/` `*Adapter` `*Manager` フォルダ。1 関数 1 ファイル (§0-2、反省文 §1.4)
- **sub-ID 即興発明**: `B.1` `D.2a` 等を Group 着手時以外 (= build 中) に作らない (memory 行 16, 18 / 反省文 §3)。Group ID (A/B/C/D/E) は§3 で固定、Group 内 step 名は Group 着手時の todoList 宣言で固定
- **多軸同時変更** (§0-4、Group A〜D のみ。Group E は例外)
- **Group A〜D 中のレガシー編集** (§0-3 違反)
- **Group A〜D 中のレガシー削除** (`git rm` 系コマンド全部、§0-1 違反)
- **抽出のみのターン**: 削減を伴わない切り出し (§0-7、反省文 §1.2)
- **test 後回し**: build と同期で test を追加しない (§0-6 違反)
- **「機能だけある程度」を口実にした仕様逸脱** (§0-9 違反): 仕様書記載の挙動は必須
- **roadmap 構造の改変**: 本書のテーブル・catalog ID 体系を agent が編集 (memory 行 16, ユーザ明示)
- **KPI 緩和の独断**: byte-equal を構造比較に独断緩和、fixture 数の妥協など (memory 行 21、ユーザ承認必須)

---

## 6. ロールバック方針

- 各 Group 着手時に `git tag group-X-start` (X = `C`, `D`, `E`)
- build フェーズで回帰または設計上の致命的な誤り → `git reset --hard group-X-start` → 別アプローチで再着手
- Group E 削除コミット失敗 → `git reset --hard HEAD~1` → 削除戦略を見直し

v3 にあった「§0-1 5 ターン上限超過で自動巻戻し」は v4 では適用なし。

---

## 7. 推定ターン数

| Group | 状態 | build ターン | 累計 |
|---|---|---|---|
| (済) #1 ProgressBar (v2) | 完了 | 0 | 0 |
| A. SlideShow (+rendering chain bootstrap) | **完了済** (v3 で実装) | 0 | 0 |
| B. ViewerDocumentIO | **build 1-8 完了済**、残 round-trip test 1 ターン | 1 | 1 |
| C. SlideList | 未着手 | 3-5 | 4-6 |
| D. Edit (複数 step) | 未着手 | 15-25 | 19-31 |
| E. 最終 bulk delete + entrypoint 統合 | 未着手 | 2-3 | 21-34 |

合計 **約 21〜34 ターン (残り)**。Group A/B で rendering chain と storage が実装済のため、Group C/D の build コストは v3 推定より下がる (新側 library 漸進蓄積効果)。Group E は単一フェーズだが削除規模が大きいため 2-3 ターン。

但し書き:
- ターン数の絶対値より「Group ごとに build 完了条件が満たされていること」が成否指標
- Group D で chunk 分割が必要になった場合、Group D 着手時の todoList で宣言する

---

## 8. v3 との差分

| 観点 | v3 (archived) | v4 |
|---|---|---|
| Strategy | Strangler fig + per-Group swap chunk | **Forward-only build + 最終 bulk delete** |
| Group ごとの構成 | build (1-5 ターン) + swap (1 ターン) | **build のみ**。swap は Group E に集約 |
| swap 上限 | 5 ターン (§0-1) | **撤廃**。build 完了条件のみ |
| レガシー編集 | build 中禁止、swap 内 import 除去のみ例外 | **Group E まで全期間禁止**、例外なし |
| LOC 帳簿 | 各 Group 完了ごとに total 単調減少 | ~~**Group E 完了時点で < 6,500**~~ → LOC KPI 除外 (§1 改訂)。それまでは単調増加 |
| test 追加タイミング | swap コミットに同梱 (§0-6) | **build と同期** (§0-6 改訂) |
| dual entrypoint 統合 | Group D 末尾の swap で | **Group E で独立フェーズとして** |
| Group 数 | A/B/C/D (4) | **A/B/C/D/E (5)**、E = 最終 bulk delete |
| 起点 | `c1936d80` (v2 P0-P1 完了) | **`cae71b14`** (v3 Group A 復元 + Group B build 1-8 完了) |
| 推定ターン | 38-51 | **21-34 (残り)** |

---

> 執行者へ:
>
> v4 は「**新側を継続構築する方がコードが clear になる**」というユーザの実装後判断 (2026-06-20) に基づく方針転換版である。
>
> v3 が破綻したのではない (Group A swap が一度成立して巻戻されただけ) が、**per-Group swap を実施すると新側コードが clear に組めない**という事実が判明したため、forward-only に切替えた。
>
> v4 の鉄則は §0-3 (全期間レガシー編集禁止) と §0-6 (test 同期追加) と §0-10 (新側内製) の 3 つ。これらが満たされていれば、Group E に到達した時点で「新側だけで完結する代替実装」が存在し、bulk delete が機械的に成立する。
>
> 失敗パターン: (i) Group E 直前で「機能 parity が未達」と発覚 → Group D に戻る、(ii) 新側が密結合になり Group E の bulk delete で連鎖破壊 → §0-10 と §0-2 を再確認、(iii) test が後回しになり Group E で大量の regression → §0-6 を再確認。
