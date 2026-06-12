# React 移行ロードマップ（段階計画）

## 目的
本ドキュメントは、現行 jQuery アプリを React へ段階的に移行する際の実行順序、完了条件、ロールバック方針を定義する。
機能の棚卸しは [docs/function-list.md](docs/function-list.md) を参照する。

## 機能保持ゲート（必須）
マイグレーション時は、以下を満たさない変更を完了扱いにしない。

1. 変更対象機能の事前特定
  - 影響する機能を `docs/function-list.md` で明示する。
2. 実装後の機能保持確認
  - 最低限、該当機能の正常系を手動または自動で確認する。
  - 失敗時は次の移行へ進まず、先に修正する。
3. 結果の記録
  - 何を確認し、何が通ったかを `docs/migration-roadmap.md` または `docs/test-plan.md` に追記する。
4. 回帰の扱い
  - 既存機能を落とした場合は「移行進捗」ではなく「不具合修正」を優先する。

## 関連仕様
- docs/mode-spec.md
- docs/state-management-design.md
- docs/sensitive-mode-spec.md
- docs/data-compatibility-spec.md
- docs/test-plan.md
- docs/phase1-closeout.md
- docs/phase2-kickoff-checklist.md
- docs/phase2-risk-control.md

## 実装進捗（2026-06-09）
- Phase 1 完了
  - React エントリを追加し、jQuery と共存する段階置換構造を導入
  - Mantine ThemeProvider とデザイントークンを導入
  - React 製のスライド一覧閲覧ミラー UI を追加（Slide List mirror）
  - モード判定の実装を追加（query override + standalone/mobile 判定）
  - feature gate の初期実装を追加（mobile pwa で編集/保存系を無効化）
  - スマホ縦起動時の横向きフォールバック（transform 回転）を追加
  - readonly 時の UI ガードを追加（編集領域非表示、破壊操作ボタン無効化）
  - action-level ガードを追加（保存/出力/背景更新を runtime gate で reject）
  - readonly 時のスライド並び替えを禁止（sortable disabled）
  - ListViewController の編集操作 API に reject を追加（add/clone/remove/sort）
  - FileSelector の保存データ削除（dispose）を readonly 時に reject
  - FeatureGate を拡張（canImport/canDeleteSavedData）して権限粒度を明確化
  - 反映コード:
    - `src/react/mountRuntimeShell.tsx`
    - `src/react/RuntimeShell.tsx`
    - `src/types/styles.d.ts`
    - `src/runtime/applyFeatureGate.ts`
    - `src/runtime/mode.ts`
    - `src/runtime/featureGate.ts`
    - `src/runtime/mobileOrientation.ts`
    - `src/index.ts`
    - `src/Viewer.ts`
    - `src/viewController/ListViewController.ts`
    - `tsconfig.json`
    - `css/index.css`

  - 判定ドキュメント
    - `docs/phase1-closeout.md`
    - `docs/phase2-kickoff-checklist.md`

- Phase 2 着手
  - `StorageAdapter` interface を追加
  - `LegacySlideStorageAdapter` を追加し、現行 `SlideStorage` をラップ
  - `Viewer` と `FileSelector` の `SlideStorage` 直結依存を Adapter 経由へ差し替え
  - `DocumentStorageUseCase` を追加し、保存系の feature gate 判定を UseCase 層へ移管
  - `StorageActionResult`（Resultモデル）へ移行し、UI 側で失敗通知を一元化
  - save/export/import を非同期 `Result` に統一し、`StorageEventType.ERROR` を追加して通知導線を event 経由へ統一
  - load/delete も非同期 `Result` に統一し、Storage event 完了を待って成功/失敗を確定
  - load/delete の event 待機にタイムアウト制御を追加し、未完了ハングを失敗として扱う
  - `DocumentStorageUseCase` の event 待機ロジックを共通化し、非同期処理の拡張点を整理
  - `DocumentStorageUseCase` に意味論イベント API（`onLoading/onLoaded/onUpdated/onError`）を追加し、UI 層の event 名依存を削減
  - `SlideStorage` の境界型を強化（`StorageExportOptions`/`File` 適用、`any` 削減、未使用状態の整理）
  - Phase2 fixture 存在チェックをスクリプト化（`npm run check:phase2-fixtures`）し、互換テスト前提を明示化
  - fixture チェックを強化し、欠落に加えて最小サイズ未満（空/不完全ファイル）も検出
  - PNG埋め込みfixture再生成スクリプトと hvd/hvz/png 実解析チェックを追加（`gen:phase2-png-fixture`, `check:phase2-compat`）
  - round-trip最小観点に対応する主要項目比較チェックを追加（`check:phase2-core-fields`）
  - fixture間のJSON構造等価チェックを追加（`check:phase2-structure`）
  - unsupported version / 破損入力など失敗系の最小検証を追加（`check:phase2-error-cases`）
  - fixture/compat/core/sensitive を一括実行する総合チェックコマンドを追加（`check:phase2`）
  - Phase2検証スクリプトの共通ライブラリを追加し、fixture解析ロジックを集約
  - `check:phase2` を pull request / develop2 push で自動実行する CI workflow を追加
  - CI の Phase2 チェックを個別ステップ化し、失敗箇所の特定性を向上
  - 構造チェックの差分レポート出力と CI artifact 収集を追加し、失敗時の診断性を向上
  - 構造差分を複数件収集するレポート拡張と error-case レポート出力を追加
  - 実ファイル異常fixture（broken hvz/png, unsupported v1 hvd）を追加し、失敗系検証を自動化
  - 生成レポート（structure/error-case/error-fixture）の整合チェックを追加し、CI失敗時の検知精度を向上
  - レポート整合チェックを厳格化（期待label集合の検証）し、統合サマリーレポートを追加
  - Phase2 完了判定を満たしたため、以後は追加厳密化を停止し Phase3 実装へ移行
  - React RuntimeShell を常時マウントに変更し、スライド選択/追加/複製/削除の操作導線を React 側に移管開始
  - React RuntimeShell に file/new/import/export/save/load/delete/slideshow 操作導線を追加し、運用導線の React 側置換を開始
  - Phase3 方針を確定: ハードコードDOMをTSX構築へ段階移行し、新規移行ロジックはクラスを追加せず hooks/関数ベースで実装
  - `#menu` 領域を index.html 直書きから TSX (`LegacyMenu`) へ移管し、jQuery 既存セレクタ互換を維持して置換開始
  - `#pref` / `#images` 領域を index.html 直書きから TSX (`LegacyPanels`) へ移管し、既存セレクタ互換のまま置換範囲を拡大
  - `#main .canvas .menu` 領域を index.html 直書きから TSX (`LegacyCanvasMenu`) へ移管し、編集系コマンドDOMのReact化を開始
  - `#main .sideMenu .copypaste` / `.swap` を TSX (`LegacySideControls`) へ移管し、編集補助コントロールのReact化を開始
  - `#main .sideMenu .imageRef` / `.textEdit` を TSX (`LegacySideControls`) へ移管し、編集入力導線のReact化を開始
  - `#main .sideMenu .property` 本体（position/scale/rotation/opacity/clip）を TSX (`LegacySideControls`) へ移管し、主要編集パラメータのReact化を完了
  - `#main .sideMenu .layer` の `ul` 領域を TSX (`LegacySideControls`) へ移管し、レイヤー一覧DOMのReact化を開始
  - `.list` 配下の `#slideContextMenu` / `#listContextMenu` を TSX (`LegacyListContextMenus`) へ移管し、一覧コンテキストメニューDOMのReact化を開始
  - `#main` の骨格DOM（canvas/sideMenu/list と各 React ホスト）を TSX (`LegacyMainShell`) へ移管し、index.html の直書き領域をさらに縮小
  - `#wrapper` 配下の骨格DOM（`#pref`/`#images`/`#menu`/`#main`）を TSX (`LegacyAppShell`) へ移管し、index.html をホスト構造へ簡素化
  - `#main` 配下の分割マウント（canvas menu / side controls / list context menus）を `LegacyMainShell` 内の直接合成へ統合し、createRootの分散を削減
  - `LegacyAppShell` が `LegacyMainShell` を内包する構成へ整理し、`#main` 個別マウントを廃止して起動経路を一本化
  - 未使用となった分割マウントファイル（`mountLegacyCanvasMenu`/`mountLegacySideControls`/`mountLegacyListContextMenus`/`mountLegacyMainShell`）を削除し、移行後構成へ整理
  - `LegacyAppShell` 内で `#pref`/`#images`/`#menu` を直接合成する構成へ統合し、`mountLegacyPanels`/`mountLegacyMenu` を廃止
  - `index.ts` から `LegacyAppShell` を直接マウントする構成へ変更し、`mountLegacyAppShell` を廃止
  - `LegacyAppShell` / `LegacyMainShell` / `LegacyMenu` / `LegacyPanels` に新命名エクスポート（`AppShell`/`MainShell`/`Menu`/`PrefPanel`/`ImagesPanel`）を追加し、段階的な命名移行を開始
  - `LegacyCanvasMenu` / `LegacyListContextMenus` / `LegacySideControls` に新命名エクスポート（`CanvasMenu`/`ListContextMenus`/`CopyPasteControls` ほか）を追加し、`MainShell` 側参照を新命名へ切り替え
  - 新しい再エクスポートファイル（`AppShell`/`MainShell`/`Menu`/`Panels`/`CanvasMenu`/`ListContextMenus`/`SideControls`）を追加し、import 参照の段階移行を開始
  - 本体実装を新ファイル側（`AppShell.tsx` など）へ移し、`Legacy*.tsx` は互換再エクスポート層へ反転
  - `StorageActionResult` の失敗通知処理を共通ヘルパー化し、`Viewer` / `FileSelector` の save/export/import/load/delete で通知導線を統一
  - ストレージ `error` event の通知文言をエラーコード基準で統一し、UI への生メッセージ露出を削減
  - `Viewer` の feature gate 拒否操作（新規作成/保存/書き出し/画像出力/読み込み）で明示通知を追加し、無反応に見える挙動を解消
  - `Viewer` の確認ダイアログ分岐（新規作成/読み込み/上書き保存）をヘルパー化し、変更あり判定ロジックの重複を削減
  - `Viewer` の権限チェック早期returnを `ensureAllowed` に共通化し、操作ハンドラの分岐重複を削減
  - `Viewer` の constructor から storage 初期化/I-Oバインド処理をメソッド分割し、起動時責務を整理
  - `Viewer` のスライドショー起動処理を I/O バインドから分離し、表示処理の責務を明確化
  - `Viewer` の共通I/Oバインドを保存系・取込系・表示系へ分割し、ハンドラの責務を明確化
  - `Viewer` の mode 依存初期化（edit/view-only）を専用メソッドへ分離し、分岐責務を整理
  - `Viewer` の権限判定を permission policy ヘルパーへ集約し、`can*` 分岐重複を削減
  - `Viewer` の起動シーケンスを runtime/controller/bindings の3段へ整理し、constructor の可読性を改善
  - `Viewer` の beforeunload 登録条件と登録処理を分離し、起動バインド層の責務を明確化
  - `Viewer` の `setMode` 分岐を `applySelectMode` / `applyEditMode` へ分離し、モード遷移責務を整理
  - `DocumentStorageUseCase` の未使用な汎用 event passthrough API を削除し、公開境界を意味論APIに限定
  - `Viewer` の jQuery セレクタ文字列を `SEL` 定数へ集約し、散在する文字列リテラルを削減
  - `Viewer` の `progressBar` をフィールドへ昇格し、`obj` 型を `JQuery` に絞り込んで `any` を排除
  - `src/bridge/ViewerBridge.ts` を追加し、Viewer と React の間に型付きイベントバスを導入
  - `Viewer` が `slidesChanged/selectionChanged/savedFilesChanged/modifiedChanged/modeChanged` を Bridge 経由で emit するよう実装
  - `RuntimeShell` の MutationObserver ポーリングを廃止し、ViewerBridge 購読ベースの状態管理へ切り替え
  - `ListViewController` の `addSlide/removeSlide/onSlideSort/selectSlide/set slides` から `slidesChanged/selectionChanged` を emit し、スライド操作をリアルタイムで React に通知
  - `src/bridge/useViewerBridge.ts` を追加し、`useViewerSlides/useViewerStorage/useViewerModified/useViewerMode` hooks を提供
  - `src/bridge/ViewerCommands.ts` を追加し、RuntimeShell の主要操作（slide/file/slideshow）を DOM click ではなく Viewer コマンド呼び出しへ移行
  - `ListViewController` に公開操作API（new/clone/delete/select prev/next/index）を追加し、React 側の操作導線を jQuery DOM 依存から分離
  - `savedFileSelectionChanged` bridge event を追加し、FileSelector / Viewer command の双方から保存ファイル選択状態を React へ同期
  - `Viewer` に保存ファイル選択状態 (`selectedSavedFileId`) と選択ベースコマンド（select/load/delete/next/prev）を追加し、React 側の ID 直渡し依存を縮小
  - `RuntimeShell` の File Ops を `loadSelectedSavedFile` / `deleteSelectedSavedFile` / `selectNextSavedFile` / `selectPreviousSavedFile` へ切り替え
  - `FileSelector` の load/delete/up/down 操作を `Viewer.shared.command*` 経路へ統一し、legacy UI と React UI の実行パスを共通化
  - `FileSelector` は `savedFileSelectionChanged` を購読して legacy select 表示を同期し、選択状態の単一ソースを Viewer 側へ集約
  - `FileSelector` の `DocumentStorageUseCase` 依存を削除し、`savedFilesChanged` / `savedFileSelectionChanged` 購読ベースの表示同期コンポーネントへ縮退
  - `Viewer.setupIOBindings` は `new FileSelector()` へ変更し、保存データの取得責務を `Viewer` 側へ一本化
  - legacy の `select.filename` / `.fileSelect` / `.load` / `.dispose` を `FileSelector` 内で無効化し、保存系操作導線を RuntimeShell 側へ集約
  - `Menu` から legacy 保存UI（`select.filename` / `.fileSelect` / `.save` / `.load` / `.dispose`）を除去し、保存系操作の正規導線を RuntimeShell に一本化
  - `Viewer` の `FileSelector` 初期化を停止し、保存UIミラー層を起動経路から外した
  - 未参照となった `src/viewController/file/FileSelector.ts` を削除し、legacy保存UIミラー層をコードベースから撤去
  - `css/index.css` の `#menu button.fileSelect` スタイルと `applyFeatureGate` の `.dispose` ガードを削除し、保存UI撤去後の死んだコードを整理
  - `Menu` の空プレースホルダ `<div>` を削除し、保存UI撤去後のDOMを簡素化
  - `Viewer` の legacy 保存ボタンセレクタ（`.save`）バインドと `applyFeatureGate` の `.save` 制御を削除し、保存導線の正規化を反映
  - `Menu` から legacy ファイル操作DOM（`startSlideShow` / `files...` pulldown / `input.import`）を除去し、RuntimeShell 導線へ集約
  - `Viewer` から `.new/.export/.zip/.startSlideShow/button.import/input.import` の legacy バインドを削除し、`command*` 実行中心へ整理
  - `commandOpenImportDialog` を動的 file input 生成方式へ変更し、legacy DOM input 依存を解消
  - `RuntimeShell` に `Export Img` を追加して legacy `zip` 操作の機能を維持
  - `duration/interval/bgColor/mirrorH/mirrorV` を `Viewer` 状態 + `ViewerBridge.slideshowSettingsChanged` に移し、RuntimeShell から操作可能にした
  - `SlideShowViewController.setUp` は DOM (`#interval/#duration`) 参照をやめ、`Viewer` から再生設定を受け取る構成へ変更
  - 機能保持確認: 型診断で対象ファイルのエラーがないことを確認。実挙動確認は次回変更時も継続必須
  - `Menu` と `RuntimeShell` のプルダウン (`duration/interval`) をネイティブ `select` から Mantine `NativeSelect` へ置換
  - 機能保持確認: `id=value` 互換を維持したまま型診断でエラーなしを確認
  - legacy `Menu` の描画を AppShell から除去し、スライドショー設定の保持先を完全に `Viewer` + `RuntimeShell` + `SlideShowViewController` に移管
  - `SlideShowViewController` の fullscreen/mirror 操作は hidden checkbox 依存をやめ、内部状態変更 + `settingsChanged` 通知で `ViewerBridge` と同期
  - `PrefPanel` の保存フォーマット選択を React state + `reactDomRegistry.setSaveFormat` 経由へ移行し、`#saveFormat_*` id ベース参照を削除
  - `applyFeatureGate.ts` から jQuery を除去し、`#pref`/`#images` の非表示制御を native DOM へ変更
  - `reactDomRegistry.ts` に `getSaveFormat`/`setSaveFormat` を追加し、保存形式の正規参照点を確立
  - `ImageManager.ts` から jQuery を除去し、`imgObj: JQuery<HTMLImageElement>` を `element: HTMLImageElement` に変更
  - `ImageLayer.ts` の `getImageById` 参照を `getImagePropsById` に変更し、deprecated API 使用を削除
  - `ImageView.ts` の `imgObj: any` を `imgElement: HTMLImageElement | null` に変更し、jQuery 依存を除去
  - `LayerView.ts` の `opacityObj` を `HTMLElement | null` へ型変更し、opacity 操作を native DOM に変更
  - `Viewer.ts` の drop/dragover ハンドラを jQuery から native DOM イベントリスナーへ変更
  - `index.ts` の `$(function() {})` を `DOMContentLoaded` イベントに変更
  - `ViewerDocument.ts` から jQuery を除去し、`isTransparent` を `false` に固定（`#saveImageAsTransparent` 参照削除）
  - `LayerViewFactory.ts` の DOM 生成を `makeLayerWrapper()` ヘルパーに整理
  - `CanvasSlideView.ts` のサムネイル管理を jQuery ラッパーから native `HTMLCanvasElement` 直接操作へ変更（型を `any` から `HTMLCanvasElement` へ厳格化）
  - `LayerView.ts` の `updateMatrix`/`updateView` を native DOM（`style.transform`/`classList`）へ変更し、jQuery import を除去
  - `TextView.ts` から jQuery を除去し、テキスト DOM を native API で構築・操作するよう変更
  - `ImageView.ts` の `width`/`height` getter を native `offsetWidth`/`offsetHeight` へ変更し、残存 jQuery 呼び出しを除去
  - 機能保持確認: 型診断で対象ファイルのエラーがないことを確認。実挙動確認は次回変更時も継続必須
  - 反映コード:
    - `src/react/LegacyAppShell.tsx`
    - `src/react/LegacyMainShell.tsx`
    - `src/react/LegacyListContextMenus.tsx`
    - `src/react/LegacySideControls.tsx`
    - `src/react/LegacyCanvasMenu.tsx`
    - `src/react/LegacyPanels.tsx`
    - `src/react/LegacyMenu.tsx`
    - `.github/workflows/phase2-check.yml`
    - `src/react/RuntimeShell.tsx`
    - `src/index.ts`
    - `src/storage/StorageAdapter.ts`
    - `src/storage/LegacySlideStorageAdapter.ts`
    - `src/storage/createStorageAdapter.ts`
    - `src/useCase/DocumentStorageUseCase.ts`
    - `src/useCase/storageActionResult.ts`
    - `src/bridge/ViewerCommands.ts`
    - `src/bridge/ViewerBridge.ts`
    - `src/bridge/useViewerBridge.ts`
    - `src/Viewer.ts`
    - `src/react/RuntimeShell.tsx`
    - `src/viewController/ListViewController.ts`
    - `src/utils/SlideStorage.ts`
    - `src/react/Panels.tsx`
    - `src/runtime/applyFeatureGate.ts`
    - `src/runtime/reactDomRegistry.ts`
    - `src/utils/ImageManager.ts`
    - `src/model/layer/ImageLayer.ts`
    - `src/view/layer/ImageView.ts`
    - `src/view/layer/TextView.ts`
    - `src/view/LayerView.ts`
    - `src/utils/LayerViewFactory.ts`
    - `src/view/slide/CanvasSlideView.ts`
    - `src/model/ViewerDocument.ts`

  ## Phase 1 完了判定（チェック）
  - React エントリ追加: 完了
  - Mantine ThemeProvider 導入: 完了
  - browser/mobile 判定と feature gate: 完了
  - スライド一覧閲覧 UI の React 化: 完了（ミラー UI 方式）
  - スライドショー起動導線維持: 完了

## 前提
- 段階移行とし、各フェーズで動作する成果物を維持する
- 原則は同一 HTML（同一エントリ）で実装する
- UI/CSS ライブラリは Mantine を採用する
- モード要件:
  - PC ブラウザ: browser mode（編集可）
  - スマホ PWA: mobile pwa mode（基本閲覧のみ）
- スマホ PWA は横画面 UX を前提とする（縦起動時フォールバック含む）
- センシティブモード（ドキュメント単位 ON/OFF）を最終的に実装対象とする

## スコープ
- In:
  - UI レイヤの React 化
  - モード判定と機能ゲート
  - 既存データ互換を維持した保存/読込
  - スライドショー・閲覧機能の維持
  - 編集機能の段階移行
- Out（本ロードマップでは実装しない）:
  - 大規模な機能追加
  - 既存フォーマットの破壊的変更

## フェーズ構成

## Phase 0: 設計固定
### 目的
実装前に仕様ブレを止める。

### 作業
- モード仕様（browser/mobile pwa）の確定
- 画面向き仕様（横固定 + transform フォールバック）の確定
- センシティブモード仕様の詳細化（認証・暗号化・復号・失敗時挙動）
- 状態管理方針（Document/Slide/Layer/History）確定

### 完了条件
- 設計ドキュメントがレビュー承認済み
- 実装フェーズごとの受け入れ条件が定義済み

### ロールバック条件
- 仕様未確定項目が残る場合は実装開始しない

## Phase 1: App シェル + 閲覧基盤 React 化
### 目的
最小の React アプリとして閲覧できる状態を作る。

### 作業
- React エントリを追加し、既存 UI を段階置換できる構造を作る
- Mantine の ThemeProvider とデザイントークン（色、余白、タイポ）を導入する
- browser/mobile pwa の起動判定を実装
- モードに応じた feature gate（編集系 UI を無効化）を導入
- スライド一覧の閲覧 UI を React 化
- スライドショー起動導線を維持

### 完了条件
- PC ブラウザで一覧表示とスライドショー起動が可能
- スマホ PWA で閲覧のみが有効
- 既存 jQuery 画面と機能差分が明文化されている

### ロールバック条件
- 閲覧が破綻した場合、旧エントリへ切替できる

## Phase 2: データ層・永続化の分離
### 目的
UI とデータ処理を分離し、以降の移行を安全化する。

### 作業
- 既存保存読込処理を抽象化（Storage Adapter）
- IndexedDB / import / export を React 側から利用可能にする
- 互換性テストを追加（既存 hvd/hvz/png 埋め込み）

### 完了条件
- 既存データの保存/読込/入出力が維持される
- UI 層の差し替えに影響されないデータ API が整備される

### ロールバック条件
- 既存データを読み込めない事象が出た場合は旧ストレージ実装へ戻す

## Phase 3: 編集機能の段階移行（コア）
### 目的
編集機能の中核を React 化する。

### 作業
- 編集キャンバス移行（選択・移動・拡縮・回転・反転）
- レイヤーリストとプロパティ編集 UI 移行
- Undo/Redo（Command 履歴）を独立ストアとして移植
- クリップ、整列、順序変更、コピー系操作の移行

### 完了条件
- 主要編集操作が browser mode で既存同等
- mobile pwa mode では編集操作が確実に無効

### ロールバック条件
- 主要編集でデータ破損のリスクがある場合は、該当操作のみ旧 UI へフォールバック

## Phase 4: センシティブモード実装
### 目的
ドキュメント単位の保護機能を実運用可能にする。

### 作業
- `isSensitive` メタの保存/読込
- パスワード入力フロー実装
- 画像データの暗号化保存と復号表示
- 認証失敗時の非表示制御

### 完了条件
- センシティブ ON 文書は認証成功時のみ表示
- 非センシティブ文書との互換が維持される

### ロールバック条件
- 復号失敗や表示誤りが出た場合、センシティブ文書の読込を保護モードで停止

## Phase 5: スマホ PWA 体験の最適化
### 目的
スマホ PWA の閲覧体験を安定させる。

### 作業
- 横画面固定の試行（Orientation API）
- 縦起動時の transform 回転フォールバック
- セーフエリア、タップ座標、レイアウト再計算の最適化

### 完了条件
- 縦起動でも横 UX が成立
- 一覧とスライドショーが安定動作

### ロールバック条件
- 端末依存で操作不全が出る場合、機種条件でフォールバック戦略を分岐

## Phase 6: 仕上げ・旧実装撤去
### 目的
移行完了後の運用可能なコードベースへ収束させる。

### 作業
- 旧 jQuery 依存コードの段階的撤去
- 不要 CSS/アセット整理
- 回帰テストとドキュメント最終更新

### 完了条件
- 主要ユースケースが React 実装のみで成立
- 旧実装なしでリリース判断が可能

### ロールバック条件
- 本番相当テストで重大回帰が出る場合、撤去対象を限定して延期

## マイルストーン
- M1: Phase 1 完了（閲覧基盤 React 化）
- M2: Phase 2 完了（データ層分離）
- M3: Phase 3 完了（編集コア移行）
- M4: Phase 4 完了（センシティブ対応）
- M5: Phase 5 完了（スマホ PWA 最適化）
- M6: Phase 6 完了（完全移行）

## 横断タスク（全フェーズ共通）
- 既存機能とのギャップ管理
- 回帰テスト更新
- パフォーマンス計測（初期表示、編集応答、スライドショー遷移）
- 不具合トリアージと優先度運用

## 受け入れ基準（全体）
- browser mode で既存の編集体験を維持
- mobile pwa mode で閲覧体験を維持
- データ互換を破壊しない
- センシティブ文書の保護要件を満たす

## リスクと対策（初版）
- リスク: 編集機能の同等性不足
  - 対策: 編集機能は操作カテゴリごとに段階移行し、旧 UI フォールバック経路を残す
- リスク: 端末差異による画面向き不整合
  - 対策: API ロック失敗時の transform 回転を標準経路として設計
- リスク: センシティブ処理の互換不整合
  - 対策: メタデータ version を明示し、復号失敗時は安全側で表示停止
