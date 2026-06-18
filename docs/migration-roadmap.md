# React 移行ロードマップ（再構築版 / 合理化計画）

> 本ドキュメントは旧ロードマップ（[docs/migration-roadmap.archived.md](migration-roadmap.archived.md)）を
> 実コード精査の結果にもとづいて再構築したものである。旧計画は「同一 HTML 上でブリッジを介した
> 段階移行」を採った結果、状態管理が多重化し神クラス化した。本版はその構造的負債の解消を主目的とする。

## 0. なぜ再構築するか（旧計画の失敗の総括）

旧計画はフェーズ進行そのものは前進したが、**移行戦略が「縮小」ではなく「並存」を生んだ**。
ブリッジ層と互換層を残したまま React を足したため、同じ状態を複数経路が更新する構造になった。

### 根本原因：Single Source of Truth（SSoT）の不在
状態が次の 4 系統に分裂し、同期がイベント経由の自動／手動の混在で行われている。

| 系統 | 実体 | 役割 | 問題 |
|------|------|------|------|
| モデル層 | `Layer`/`Slide` の `EventDispatcher` + `PropertyEvent` | 変更通知 | 旧 MVC のイベント機構が現役 |
| ストア層 | Zustand `layerStore`/`slideStore`/`viewerDocumentStore` | React 連携 | 部分的にしか自動同期しない |
| ブリッジ層 | `ViewerBridge`（pub/sub 19 イベント） | jQuery↔React 通信 | `Viewer.ts` から 18 箇所 emit |
| シングルトン | `Viewer.shared`（static） | コマンド委譲先 | `ViewerCommands` 全メソッドが依存 |

### 実測される構造的負債（2026-06 時点）

| 指標 | 実測 | 評価 |
|------|------|------|
| `src/react/RuntimeShell.tsx` | **2,413 行**（useState 25+、useEffect 15+） | 神コンポーネント |
| `src/Viewer.ts` | **1,700 行**（public メソッド 80+） | 神クラス／static singleton |
| `src/useCase/EditLayerMutationUseCase.ts` | 820 行 | 肥大ユースケース |
| `src/runtime/SlideShowRuntime.ts` | 595 行（`any` 多用、jQuery 依存） | 未 React 化 |
| `src/view/slide/EditableSlideView.tsx` | 560 行（内部で命令的 DOMSlideView を管理） | ハイブリッド |
| jQuery 依存ファイル | 4（`index.ts` / `Viewer.ts` / `SlideShowRuntime.ts` / `utils/LayerViewFactory.ts`） | 撤去対象 |
| `Viewer.shared` 参照 | `Viewer.ts` / `ViewerCommands.ts` | 撤去対象 |
| `innerHTML` 直書き | `src/view/layer/TextView.tsx`（XSS リスク） | 即時是正 |
| ダイアログ状態の過剰分割 | `*Request.ts`/`*Gate.ts`/`*Choice.ts` 6 ファイル（各 6–12 行） | 集約対象 |
| 命令的 View 層 | `LayerView`/`ImageView`/`TextView`（class + DOM 直操作） | React FC 化 |
| 二重 React root | `#wrapper`(AppShell) と `#react-runtime-shell`(RuntimeShell) | 単一化 |

健全性評価：**3/10**。健全な資産は Zustand ストア構造と Storage Adapter 抽象。
負債は神ファイル・jQuery 混在・二重実装・状態多重化。

---

## 1. 目的（再定義）

### 1.1 アーキテクチャ転換の到達点
本移行は**「ロジックを持つクラス + EventDispatcher + 更新メソッド」から
「型・関数ベース + カスタムフックでのロジック提供」へのモダン React アーキテクチャ化**である。

| 旧（撤去対象） | 新（到達点） |
|----------------|--------------|
| ロジック内包クラス（`LayerView`/`ImageView`/`TextView`/`Viewer`） | 純データ型 + 純粋関数 + カスタムフック |
| `EventDispatcher` / `PropertyEvent` による変更通知 | Zustand ストアの購読（selector）＋ React 再レンダリング |
| `updateView()` 等の命令的更新メソッド | props/state からの宣言的レンダリング |
| jQuery（`$`）・`obj: any` | 型付き React 要素・ref |

### 1.2 目的一覧（優先度順）
1. **【最優先】jQuery（`$` / `obj: any`）と `EventDispatcher` を排除する**。これがクラス＋命令更新の中核であり、最初に断つ。
2. **状態管理を Zustand に一元化**し、SSoT を確立する（`EventDispatcher` の代替）。
3. **ブリッジ／シングルトン（`ViewerBridge` / `Viewer.shared`）を撤去**する。
4. **ロジック内包クラスを型・関数 + カスタムフックへ転換**し、View 層を React FC へ統一する。
5. **神ファイルを責務分割**し、UI を単一責務コンポーネントへ分散する（`Viewer.ts` / `RuntimeShell.tsx`）。
6. 上記を通じて**実行経路を React/TSX 側へ移し切る**。

機能の棚卸しは [docs/function-list.md](function-list.md) を参照する。

---

## 2. 合理化の設計原則（旧方針からの転換）

| # | 旧方針 | 新方針 |
|---|--------|--------|
| P1 | ブリッジ経由で両層を並存 | **片方向の縮小**：レガシー経路は移行と同時に削除する（並存期間を最小化） |
| P2 | モデル `EventDispatcher` を温存 | **SSoT は Zustand**。モデルは純データ型に限定し、`EventDispatcher`/`PropertyEvent` を撤去する（温存しない） |
| P3 | `Viewer.shared` 経由でコマンド委譲 | **コマンドはストア action / カスタムフック**として公開。singleton 禁止 |
| P4 | 機能単位で UI を肥大化 | **UI はコンポーネントへ分散**。単一責務に分割し、神ファイルは着手前に解体する |
| P5 | jQuery を暫定容認 | **jQuery（`$` / `obj: any`）は最優先で排除**。新規禁止かつ既存も先行除去する |
| P6 | （新設）ロジックの置き場 | **ロジックは純粋関数 + カスタムフックに置く**。ファットな一時退避サービス（巨大 `XxxService`/`XxxManager` クラスへの暫定移植）は作らない |
| P7 | （新設）UI の見た目 | **当初の UI を Mantine で再現**。raw CSS の段階置換を前提に、見た目・操作性の同等性を保つ |

### 不変条件（機能保持ゲート）— 旧計画から継承
1. 変更対象機能を [docs/function-list.md](function-list.md) で事前特定する。
2. 実装後に該当機能の正常系を手動／自動で確認する。失敗時は次へ進まず先に修正する。
3. 確認結果は [docs/test-plan.md](test-plan.md) に記録する。
4. 既存機能を落とした場合は「進捗」ではなく「不具合修正」を最優先する。
5. 各フェーズ完了判定に**「実行経路が React/TSX 側へ移ったこと」**を含める。

---

## 3. 現状から完了形への構造遷移（目標アーキテクチャ）

```
[現状] 4 系統が相互更新                 [目標] 単方向データフロー
                                         
 Viewer.shared ─┐                        React (TSX components)
 ViewerBridge ──┼─▶ 同じ状態を              │  ▲
 Zustand ───────┤   多重更新                │  │ selector
 Model Event ───┘                         action │  state
                                            ▼  │
                                        Zustand stores (SSoT)
                                            │  ▲
                                       useCase / command 関数
                                            │  │
                                        Model (純データ + 最小副作用)
                                            │
                                        StorageAdapter（既存・維持）
```

詳細は [docs/state-management-design.md](state-management-design.md) に追補する。

---

## 4. 再構築フェーズ（R0–R6）

旧フェーズ番号との混同を避けるため `R`（Rebuild）系で付番する。
**順序は「土台の一本化 → 神ファイル解体 → レガシー撤去」を厳守**する（先に撤去すると回帰が制御不能になる）。

### R0: ベースライン固定と安全網（着手前提）
**目的**：撤去を安全に進めるための回帰検知基盤を先に作る。
- 主要ユースケースの現状動作を [docs/test-plan.md](test-plan.md) にスナップショット化。
- `npm run test:usecase` の対象を保存／読込・編集コアまで拡張（最小回帰セット）。
- `tsconfig` を厳格化（`noImplicitAny` 方針確認）。`any` 残存箇所（`SlideShowRuntime`/`EditCanvasRuntime`）を棚卸し。

**完了条件**：回帰最小セットが緑。撤去対象一覧（jQuery 4 / singleton / bridge 19 イベント）が確定。
**ロールバック**：安全網が無い状態で R2 以降の撤去に進まない。

### R1: 状態の SSoT 化（Zustand 一元化）
**目的**：4 系統を Zustand へ収束させ、二重管理を解消する。
**方針**：big-bang を避け、ストラングラー方式で**各サブステップごとに `npm run test:usecase`（R0=71 pass）を緑に保つ**。
モデルクラスの `EventDispatcher` 内部実装の完全撤去は R4 と協調するが、R1 では**「UI 同期が `PropertyEvent` に依存しない」状態**までを到達点とする。

#### R1.0: スナップショット型 + 純粋マッパー（純加算・低リスク）
- UI が必要とするプレーンデータ型（`LayerSnapshot` / `SlideSnapshot` / `DocumentSnapshot`）を定義。
- モデル → スナップショットの**純粋関数マッパー**を追加し、単体テストを付ける。
- この時点では挙動を変えない（型と関数の追加のみ）。「純データ」の目標形を確定する。

#### R1.1: 読み取り経路をスナップショットへ一本化
- ストアがスナップショット（プレーンデータ）を公開し、React の読み取りを**モデル getter から selector へ移行**。
- モデルは暫定的に真実源のまま（`notify` 時にマッパーを走らせる）。UI からモデル getter 直読を除去。

#### R1.2: `EditLayerState` を UI 状態とモデル由来状態へ分離
- `EditLayerSelectionState`（`hasSelection`/`canPaste*` 等 UI 状態）と
  `EditLayerValues`（`x`/`y`/`scale` 等モデル由来）に型・スライスを分割。
- `layerStore` と消費側、関連テストを更新。

#### R1.3: 書き込み経路をストア action へ集約
- 変更操作をストア action / useCase 関数に集約し、**モデル更新とスナップショット更新を同一トランザクション化**。
- UI パスから直接のモデル setter 呼び出しを段階的に撤去。

#### R1.4: `notifyLayersChanged()` 手動呼び出しの廃止
- 配列変更（add/remove/sort）を action 内に閉じ、`Viewer.ts`/`EditCanvasRuntime` 等に散在する手動 `notify*` を撤去。

#### R1.5: Undo/Redo のトランザクション統合
- `HistoryManager` の記録をスナップショット更新と同一トランザクションに統合。
- `emitAfterMutation` の副作用重複・失敗時不整合リスクを排除。

#### R1.6: `PropertyEvent` UI 同期撤去の確認（R1 ゲート）
- UI 同期が `PropertyEvent` に依存しないことを確認（KPI: UI パスの `EventDispatcher`/`PropertyEvent` 参照ゼロ）。
- モデル内部の `EventDispatcher` 実体は R4 で除去するため、ここでは「UI 非依存」を完了線とする。

**完了条件**：状態更新経路がストア action に一本化。`PropertyEvent` 依存が UI 同期から外れている。R0 の 71 テストが緑。
**ロールバック**：特定操作で不整合が出た場合、その操作のみ旧経路に退避し原因修正を優先。

### R2: ブリッジ／シングルトン撤去
**目的**：`ViewerBridge` と `Viewer.shared` を排除し、密結合を断つ。
- `ViewerBridge.emit`（`Viewer.ts` 18 箇所）を、対応するストア action 呼び出しへ置換。
- `ViewerCommands` を **store action / useCase 関数の薄い re-export** に置換し、`Viewer.shared` 参照を削除。
- `useViewerBridge` 系 hook を `useXxxStore` セレクタへ移行。

**完了条件**：`ViewerBridge` と `Viewer.shared` への参照がゼロ。React は store からのみ状態取得。
**ロールバック**：イベント欠落が出た機能は、当該イベントのみ一時的に復活し差分を埋める。

### R3: `Viewer.ts` 神クラスの解体
**目的**：1,700 行を責務単位の useCase / store action へ分解する。
- スライド管理・レイヤー管理・スライドショー・ストレージ・ダイアログ制御を**機能ドメインごとに切り出し**。
- 各 `command*` メソッドを対応 useCase へ移設（呼び出し側は R2 で既に store/useCase 参照）。
- `Viewer` は最終的に**起動オーケストレーションの薄いブートストラップ**に縮小。

#### R3.1: スライドショー useCase 切り出し（実施済）
- `SlideshowUseCase` を新設し、`commandSetSlideShow*` / `commandStart|Stop|TogglePause` / `commandShowPrevious|NextSlide` / `handlePlaybackChanged` 等を移設。

#### R3.2: 画像エクスポート useCase 切り出し（実施済）
- `ImageExportUseCase`（純関数）を新設し、`commandDownloadSelectedSlide` / `commandExportImages` のロジックを移設。

#### R3.3: 保存ファイルナビゲーション useCase 切り出し（実施済）
- `SavedFileNavigationUseCase` を新設し、`selectedSavedFileId` を `uiStore.storage.selectedId` に統合。`commandSelectNext|PreviousSavedFile` / `commandLoadSelectedSavedFile` / `commandDeleteSelectedSavedFile` のロジックを移設。

#### R3.4: スライド履歴 useCase 切り出し（実施済）
- `SlideHistoryUseCase` を新設し、`emitHistoryState` / `emitCurrentSlides` / `emitSlideHistoryMutation` / `recordSlideHistoryCommand` を `publishHistoryState` / `publishSlides` / `publishHistoryMutation` / `record` として移設。

#### R3.5: レイヤー編集コマンド useCase 切り出し（実施済）
- `LayerCommandsUseCase` を新設し、レイヤー回転・並び替え・コピー/貼り付け・透明度・クリップ・キャンバス倍率・画像差し替え/削除など 60+ メソッドを移設。`emitEditSelectionState` / `emitCurrentEditState` / `runEditOperation` 系ヘルパは `publishEditSelectionState` / `publishCurrentEditState` / 内部 `run`/`runSelection` に集約。

#### R3.6: スライド操作コマンド useCase 切り出し（実施済）
- `SlideCommandsUseCase` を新設し、スライド追加・複製・削除・並び替え・結合・有効/無効・長さ比率変更・選択遷移・モード切替 22 メソッドを移設。

#### R3.7: `ViewerCommands` を useCase 直呼びの薄い re-export に書き換え
- `Viewer.command*` 経由の delegating を廃止し、`ViewerCommands` から各 useCase（`layerCommands` / `slideCommands` / `slideshowUseCase` / `savedFileNav` / `ImageExportUseCase` 関数）を直接呼ぶ。
- ドキュメント生成・保存・インポート・エクスポート系（`commandNewDocument` / `commandSaveDocument` / `commandExportDocument` / `commandOpenImportDialog` / `commandImportFile`）は R3.12 完了まで暫定的に Viewer 経由を残す。

#### R3.8: `Viewer.shared` 撤去（実施済）
- `Viewer.shared` 静的フィールドを削除し、`bridge/activeViewer.ts`（`setActiveViewer` / `getActiveViewer`）に singleton を隔離。`ViewerCommands` および将来の useCase registry がこの一点経由で Viewer を参照する。

#### R3.9: `command*` 薄ラッパ全削除
- R3.7 の `ViewerCommands` 改修が完了次第、`Viewer` の `command*` メソッド群（slide / layer / slideshow / savedFile / image-export 系）を一括削除（約 540 行削減）。
- 残置するのはドキュメント・モード制御の高位コマンドのみ。

#### R3.10: スライドストアヘルパーの store action 化
- `addSlide` / `removeSlide` / `selectSlideInstance` / `selectSlideByIndex` / `selectSlideByOffset` / `moveSelectedSlideToIndex` / `moveSelectedSlideByOffset` / `setSlides` を `slideStore` action または `SlideCommandsUseCase` 内部関数に吸収。
- `handleSlideSelectionChanged` / `handleSlideSelectionClosed` は `SlideCommandsUseCase` または `ModeController` に移設。

#### R3.11: ドキュメントライフサイクル useCase 切り出し
- `DocumentLifecycleUseCase` を新設し、`newDocument` / `bindViewerDocument` / `createDocumentSnapshot` / `createDefaultViewerDocument` / `hasEnabledSlides` / `getImageExportContext` / `shouldOverrideSave` / `handleStorageResult` / `rebindSlideMetaListeners` を移設。
- 残存する `commandNewDocument` / `commandSaveDocument` / `commandExportDocument` / `commandOpenImportDialog` / `commandImportFile` も本 useCase に移設し、`ViewerCommands` から直接呼ぶ形に。

#### R3.12: 起動・モード制御の分離
- `ViewerBootstrap`（`initializeRuntime` / `initializeRuntimes` / `initializeBindings` / `initializeEditModeFeatures` / `initializeDocumentStorage` / `registerBeforeUnloadWarning`）と `ModeController`（`setMode` / `applySelectMode` / `applyEditMode` / `canEnterEditMode`）を切り出し。
- `Viewer` のコンストラクタは bootstrap 呼び出しのみへ縮小。

#### R3.13: パーミッション useCase 切り出し
- `PermissionUseCase`（`ensureAllowed` / `canProceedWithDiscard` / `getPermissionPolicy` / `canEdit` / `canSave` / `canExport` / `canImport` / `showGateDenied`）として切り出し、各 useCase の deps へ注入する形に統一。

#### R3 ゲート再判定
- `Viewer.ts` 行数 < 300 を計測で確認。
- ドメインロジック残存ゼロ（純粋に起動オーケストレーションのみ）を確認。
- 79 useCase テスト緑、typecheck エラー 0 を確認。

**完了条件**：`Viewer.ts` が 300 行未満。ドメインロジックが useCase / store に移管済み。
**ロールバック**：分割で回帰した操作カテゴリは、当該カテゴリ単位で旧実装に退避。

> 進捗注記（2026-06-18 時点）：R3.1〜R3.6 / R3.8 は実施済み（`Viewer.shared` 撤去、`Viewer.ts` 1692→1053 行）。R3.7 は activeViewer 経由の delegating に留まっており「useCase 直呼びの薄い re-export」までは未到達。R3.9〜R3.13 が残作業であり、これらを通過するまで R3 完了条件（< 300 行）は満たさない。

### R4: View 層の React FC 化 + jQuery 撤去
**目的**：命令的 View とハイブリッド構造を解消する。
- `LayerView` / `ImageView` / `TextView`（class + DOM 直操作）を React FC へ再実装。
  - `TextView` の `innerHTML` を**テキストノード描画へ即時是正**（XSS 是正）。
- `DOMSlideView` の `Object.defineProperties` ベース命令的 handle を、props/state ベースへ置換。
- `EditableSlideView` のレイヤー個別 `addEventListener` を**イベント委譲**へ。
- jQuery 4 ファイル（`index.ts` / `Viewer.ts` / `SlideShowRuntime.ts` / `utils/LayerViewFactory.ts`）から `import $` を除去。
- `classList`/`style` 直操作・`document`/`window` グローバルリスナーを React 管理下（Context / hooks）へ。

**完了条件**：jQuery 依存ゼロ。編集・スライドショーの描画経路が React のみ。
**ロールバック**：描画破綻が出た View は当該レイヤー種別のみ旧実装に退避。

### R5: `RuntimeShell.tsx` 分割 + ダイアログ状態集約
**目的**：2,413 行の神コンポーネントを再レンダリング境界ごとに分割する。
- `SlideListPanel` / `EditOpsPanel` / `LayerListPanel` / `ModalContainer` 等へ分離。
- 過剰分割の `*Request.ts`/`*Gate.ts`/`*Choice.ts` 6 ファイルを `dialogState.ts` に集約（命名の概念混在を解消）。
- `*Keyboard.ts` 群を `useXxxKeyboard` hooks へ。グローバル `document` keydown を単一管理化。
- 二重 React root（`#wrapper`/`#react-runtime-shell`）を単一ツリーへ統合し Provider 重複を解消。

**完了条件**：単一コンポーネント 400 行未満を目安。Provider が単一。
**ロールバック**：分割で操作不全が出たパネルのみ旧構成へ一時退避。

### R6: 仕上げ・フォルダ整理・撤去確認・最適化
**目的**：運用可能なコードベースへ収束させる。
- `SlideShowRuntime` の `any` 一掃と React 化完了確認。
- デッドコード（空 `viewController/`、未使用 util）撤去。
- **フォルダ構成を第 8 章の目標レイアウトへ整理**（`react/` 等の不明瞭な命名を廃止し、一般的な React プロジェクト命名へ統一）。
- CSS と Mantine の二重管理整理（[css/](../css/) を Mantine スタイルへ収束し、当初 UI を Mantine で再現した状態に統一）。
- 回帰テストとドキュメント最終更新。

**完了条件**：主要ユースケースが React 実装のみで成立し、旧実装なしでリリース判断可能。フォルダ構成が第 8 章に準拠。
**ロールバック**：本番相当テストで重大回帰が出た撤去対象のみ延期。

> 注：フォルダ移動は R1–R5 の各フェーズでファイルを触る際に**逐次寄せていく**（ボーイスカウト・ルール）。R6 は最終収束と位置づけ、大規模一斉移動だけに頼らない。

---

## 5. マイルストーン

| ID | 完了フェーズ | 到達状態 |
|----|------------|---------|
| RM0 | R0 | 回帰最小セット整備・撤去対象確定 |
| RM1 | R1 | 状態 SSoT 化（Zustand 一元化） |
| RM2 | R2 | ブリッジ／シングルトン撤去 |
| RM3 | R3 | `Viewer.ts` 解体（<300 行） |
| RM4 | R4 | View 層 React 化・jQuery 撤去 |
| RM5 | R5 | `RuntimeShell` 分割・ダイアログ集約 |
| RM6 | R6 | 完全移行・フォルダ整理・最適化 |

> **Phase 4 への関門**：RM0–RM6 がすべて完了したときに限り、既存 [Phase 4（センシティブモード）](migration-roadmap.archived.md) への進行を許可する。
> **センシティブモード・PWA 最適化は当分先の話**であり、本ロードマップのスコープ外として扱う。合理化（jQuery/EventDispatcher 排除、SSoT 化、神ファイル解体、フォルダ整理）が未完了のうちは着手しない。

---

## 6. 撤去対象トラッキング（KPI）

合理化の進捗は「行数」ではなく**負債の消滅数**で測る。

| 指標 | 現状 | 目標 |
|------|------|------|
| jQuery 依存ファイル数 | 4 | 0 |
| `Viewer.shared` 参照ファイル数 | 2 | 0 |
| `ViewerBridge` イベント種別 | 19 | 0（store action へ） |
| `RuntimeShell.tsx` 行数 | 2,413 | < 400/コンポーネント |
| `Viewer.ts` 行数 | 1,700 | < 300 |
| `innerHTML` 直書き | 1 | 0 |
| 命令的 View クラス | 3 | 0 |
| 二重 React root | 2 | 1 |

---

## 7. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| 撤去先行で回帰が制御不能化 | 高 | R0 の回帰最小セットを前提とし、R1→R2→… の順序を厳守 |
| 状態一元化中の二重更新残存 | 高 | R1 完了判定で `PropertyEvent` の UI 同期経路ゼロを確認 |
| 神ファイル分割時の機能欠落 | 中 | 操作カテゴリ単位で移行・退避できる粒度に分割 |
| jQuery 撤去でスライドショー破綻 | 中 | `SlideShowRuntime` は R4 でまとめて React 化し、退避経路を一時保持 |
| センシティブ／互換の退行 | 中 | データ互換テスト（hvd/hvz/png）を撤去フェーズの都度実行 |

---

## 8. 目標フォルダ構成（命名規約の是正）

現状は `src/react/`・`src/runtime/`・`src/view/`・`src/viewController/`・`src/viewModel/` が
役割の重複・意味不明な命名（`react/` に hooks/ロジック/コンポーネントが混在）で分かれている。
一般的な React プロジェクトの命名へ寄せ、**層ではなく役割で分類**する。

### 是正方針
- `react/` という曖昧な括りを廃止する（React 化が前提のため層名にならない）。
- UI は `components/`（再利用部品）と `features/`（機能単位の画面）に分ける。
- ロジックは `hooks/`（カスタムフック）と `stores/`（Zustand）と `usecases/` に分ける。
- 旧 `view/`・`viewController/`・`viewModel/`・`runtime/` は解体し、上記へ吸収する。
- `EventDispatcher`/`PropertyEvent`/`LayerView` 等は撤去対象のため移設しない（消す）。

### 目標レイアウト（案）
```
src/
  main.tsx                  # エントリ（旧 index.ts、jQuery 起動を撤去）
  App.tsx                   # ルートコンポーネント（単一 React root）
  components/               # 汎用・再利用 UI（プレゼンテーション）
    slide/                  # SlideView / LayerView を React FC 化したもの
    layer/                  # ImageLayerView / TextLayerView（旧 ImageView/TextView）
    dialogs/                # 旧 *Request.ts/*Choice.ts を集約したモーダル群
  features/                 # 機能単位の画面（コンテナ）
    editor/                 # 編集シェル（旧 RuntimeShell を分割）
      EditorShell.tsx
      SlideListPanel.tsx
      EditOpsPanel.tsx
      LayerListPanel.tsx
    slideshow/              # スライドショー（旧 SlideShowRuntime を React 化）
    viewer/                 # 閲覧シェル（旧 AppShell/MainShell）
  hooks/                    # カスタムフック（旧 *Keyboard.ts / useViewerBridge 等）
  stores/                   # Zustand（旧 state/。SSoT）
    layerStore.ts
    slideStore.ts
    documentStore.ts
  usecases/                 # アプリケーションロジック（旧 useCase/）
  domain/                   # 純データ型と純粋関数（旧 model/。クラス→型へ）
    layer.ts
    slide.ts
    document.ts
  storage/                  # 永続化アダプタ（現状維持・良資産）
  lib/                      # 汎用ユーティリティ（旧 utils/。Manager クラスは関数化）
  styles/                   # Mantine theme + 残余スタイル（旧 css/ を吸収）
```

> マッピング例：`src/react/RuntimeShell.tsx` → `src/features/editor/*`、
> `src/view/layer/TextView.tsx` → `src/components/layer/TextLayerView.tsx`、
> `src/state/` → `src/stores/`、`src/model/` → `src/domain/`、`src/utils/` → `src/lib/`。

**原則**：移動は各 R フェーズで該当ファイルを触る際に随伴して行い、R6 で最終整合する。
import パスの一括置換のみを目的とした巨大コミットは避け、機能単位で移す。

---

## 9. 横断タスク（全フェーズ共通）
- [docs/function-list.md](function-list.md) とのギャップ管理。
- 回帰テスト（`npm run test:usecase` + 手動正常系）の都度更新。
- パフォーマンス計測（初期表示・編集応答・スライドショー遷移）。
- 撤去対象トラッキング（第 6 章 KPI）の更新。

## 関連仕様
- [docs/mode-spec.md](mode-spec.md)
- [docs/state-management-design.md](state-management-design.md)
- [docs/sensitive-mode-spec.md](sensitive-mode-spec.md)
- [docs/data-compatibility-spec.md](data-compatibility-spec.md)
- [docs/test-plan.md](test-plan.md)
- [docs/migration-roadmap.archived.md](migration-roadmap.archived.md)（旧計画・参照用）
