# 状態管理設計書（React 移行）

## 目的
現行 jQuery + MVVM 的実装を React へ移行するため、状態の責務分割とデータフローを定義する。

## 関連ドキュメント
- docs/function-list.md
- docs/migration-roadmap.md
- docs/mode-spec.md

## 1. 設計方針
- ドメイン状態と UI 状態を分離する。
- 副作用（保存/読込/入出力）を Adapter 層に隔離する。
- Undo/Redo は UI から独立した Command 履歴として管理する。
- モード制御は App レベルの feature gate で統一する。

## 2. 状態の分類
### 2.1 ドメイン状態（永続対象）
- ViewerDocument
  - `title`, `createTime`, `editTime`, `bgColor`, `width`, `height`, `isSensitive`
- Slide
  - `id`, `uuid`, `durationRatio`, `joining`, `disabled`, `layers`
- Layer
  - 共通: 位置、拡縮、回転、反転、透明度、ロック、表示
  - ImageLayer: `imageId`, `clipRect`, `isText`, `name`, `shared`
  - TextLayer: `text`, `shared`
- Image Asset
  - `imageId`, `src`, `width`, `height`, `name`

### 2.2 UI 状態（非永続）
- 現在モード
  - `mode: browser | mobilePwa`
- 画面状態
  - `viewerMode: select | edit | slideshow`
- 選択状態
  - `selectedSlideId`, `selectedLayerId`
- 表示状態
  - パネル開閉、ダイアログ表示、進捗表示、トースト
- スマホ向き制御状態
  - orientation lock 試行結果、transform フォールバック有無

### 2.3 セッション状態
- 認証状態（センシティブ文書）
  - `sensitiveAuthStatus: locked | unlocked | failed`
- クリップボード状態
  - コピー済みレイヤー、コピー済み transform

## 3. ストア構成（提案）
- `documentStore`
  - 文書、スライド、レイヤーの正規状態
- `uiStore`
  - 選択、表示、モード、ダイアログ
- `historyStore`
  - `undoStack`, `redoStack`, command 実行 API
- `assetStore`
  - imageId ベースの画像辞書
- `securityStore`
  - センシティブ認証状態、復号鍵の一時保持

注記:
- 状態管理ライブラリは実装時に最終決定（Context + useReducer / Zustand 等）。
- どの実装でも Store 責務はこの分割を維持する。

## 4. データフロー
1. UI 操作を Action として発火
2. Action が Command（undo 可能単位）へ変換される
3. Command 実行で `documentStore` を更新
4. 必要に応じて `historyStore` へ記録
5. 永続化契機で Adapter を呼び出し保存

## 5. Command 設計
### 5.1 Command インターフェース
- `do()`
- `undo()`
- `redo()`（`do()` と同義でも可）
- `label`（履歴可視化用）

### 5.2 Command 例
- `MoveLayerCommand`
- `ScaleLayerCommand`
- `RotateLayerCommand`
- `UpdateLayerPropsCommand`
- `AddSlideCommand`
- `RemoveSlideCommand`
- `ReorderSlideCommand`
- `ReplaceImageRefCommand`
- `TransactionCommand`（複合操作）

## 6. Adapter 境界
- `StorageAdapter`
  - IndexedDB 保存/読込
- `ImportExportAdapter`
  - HVD/HVZ/PNG 埋め込みデータ
- `ImageAssetAdapter`
  - 画像登録/削除/参照
- `SensitiveAdapter`
  - 暗号化/復号、パスワード検証

ルール:
- Store は Adapter を直接持たず、UseCase 層経由で呼び出す。

### 6.1 Phase2 実装詳細（2026-06-09）
- 導入済み実装
  - `src/storage/StorageAdapter.ts`
  - `src/storage/LegacySlideStorageAdapter.ts`
  - `src/storage/createStorageAdapter.ts`
- 現在の `StorageAdapter` 契約
  - event: `loading`, `loaded`, `update`（`StorageEventType`）
  - command: `save`, `export`, `load`, `import`, `delete`
  - query: `getTitles`
- 差し替え済み呼び出し点
  - `Viewer` の保存/読込/入出力呼び出し
  - `FileSelector` のタイトル参照/ロード/削除
- 現時点の実装方針
  - `LegacySlideStorageAdapter` は既存 `SlideStorage` のラッパーとして機能し、
    既存ロジックを壊さず依存方向のみ反転する。
  - 次段で `StorageAdapter` の利用を UseCase 層へ段階移管する。

### 6.2 UseCase 層移管（2026-06-09 追記）
- 導入済み実装
  - `src/useCase/DocumentStorageUseCase.ts`
- 役割
  - `StorageAdapter` の command/query/event を UI 層へ直接露出しない境界として機能する。
  - `FeatureGate`（`canSave/canExport/canImport/canDeleteSavedData`）の判定を
    保存系ユースケースに集約する。
- 現在の利用側
  - `Viewer` から save/export/import と loading/loaded event を呼び出し
  - `FileSelector` から getTitles/load/delete と update event を呼び出し

### 6.3 SlideStorage API 棚卸し（Phase2 初動）
- 現行 public API
  - event: `loading`, `loaded`, `update`
  - command/query: `save`, `load`, `import`, `export`, `delete`, `titles`
- 依存経路（現在）
  - `Viewer` -> `DocumentStorageUseCase` -> `StorageAdapter` -> `LegacySlideStorageAdapter` -> `SlideStorage`
  - `FileSelector` -> `DocumentStorageUseCase` -> `StorageAdapter` -> `LegacySlideStorageAdapter` -> `SlideStorage`
- 置換優先順（確定）
  1. `Viewer` の保存/出力/取込（完了）
  2. `FileSelector` の保存データ一覧/読込/削除（完了）
  3. import/export options とエラー型の型安全化（完了）

### 6.4 型安全化（2026-06-09 追記）
- `StorageAdapter` に以下を導入
  - `StorageRecordId`
  - `StorageExportOptions`
  - `StorageErrorCode`
- `DocumentStorageUseCase` で ID 正規化を実施
  - 入力: `string | number | string[] | null | undefined`
  - 出力: `StorageRecordId`（invalid は reject）
- `DocumentStorageUseCase` は `StorageActionResult` を返却
  - 成功: `{ ok: true, action }`
  - 失敗: `{ ok: false, action, error, message }`
  - 失敗時の `error`: `PERMISSION_DENIED`, `INVALID_ARGUMENT`, `STORAGE_IO_ERROR` など
- UI 側は `isStorageActionFailure` ヘルパーで結果を判定
  - `Viewer` / `FileSelector` は失敗時に `result.message` を通知表示

### 6.5 import 完了同期とエラー分類改善（2026-06-10 追記）
- `SlideStorage.import` を修正し、`Promise` が実処理完了まで解決されるよう統一
  - `.hvz`: zip 内の `.hvd` を特定して parse 完了後に resolve
  - `.hvd`: `file.text()` で読込後、parse 完了後に resolve
  - 失敗時は例外を握りつぶさず reject
- `DocumentStorageUseCase` は例外から `StorageErrorCode` を推定するマッピングを追加
  - `SyntaxError` や parse/zip 由来メッセージ -> `PARSE_ERROR`
  - old version / unsupported -> `UNSUPPORTED_VERSION`
  - asset/image 関連 -> `MISSING_ASSET`

### 6.6 storage 型の分離（2026-06-10 追記）
- `HVDataType` / `SlideTitle` を `src/storage/storageTypes.ts` へ移動
- `Viewer` / `DocumentStorageUseCase` / `StorageAdapter` は `utils/SlideStorage` の型依存を解消
- `SlideStorage` は legacy 実装として `storageTypes` を参照する形に変更

### 6.7 型付きストレージエラー伝播（2026-06-10 追記）
- `StorageAdapter` に `StorageOperationError` / `createStorageOperationError` を追加
- `SlideStorage` の import/parse 処理は `StorageErrorCode` 付きエラーを throw
  - `UNSUPPORTED_VERSION`, `PARSE_ERROR`, `MISSING_ASSET`, `INVALID_ARGUMENT`
- `DocumentStorageUseCase` はコード付きエラーを優先して `StorageActionResult.error` へ反映
  - 文字列メッセージ依存の推定ロジックを削減し、Result の安定性を向上

### 6.8 load/delete 失敗の Result 厳密化（2026-06-10 追記）
- `DocumentStorageUseCase` は `loadResult/deleteResult` 実行前に record 存在を検証
  - 未選択・未存在 ID は `INVALID_ARGUMENT` で即時失敗
- `SlideStorage` も `load/delete/export` の不正引数を `createStorageOperationError` で明示的に throw
- これにより `load/delete` の失敗理由が UI 通知まで一貫して伝播

### 6.9 save/export 非同期 Result 統一（2026-06-10 追記）
- `StorageAdapter.save/export` を `Promise<void>` に統一
- `DocumentStorageUseCase.saveResult/exportResult` は `Promise<StorageActionResult>` を返却
- `Viewer` は save/export の結果を `.then(...)` で受け取り、import と同じ通知パターンに統一
- 非同期処理中に発生する zip/embed/write 失敗も `STORAGE_IO_ERROR` として Result 化

### 6.10 ストレージエラーイベント統一（2026-06-10 追記）
- `StorageEventType.ERROR` を追加
- `SlideStorage` 内の DB open/load/delete の失敗は `alert` ではなく `error` event を dispatch
- `Viewer` は `StorageEventType.ERROR` を監視し、`showNotice` でユーザー通知
- これにより storage 層から UI 直接依存を削減し、通知経路を event 経由に一本化

### 6.11 load/delete 非同期 Result 統一（2026-06-10 追記）
- `DocumentStorageUseCase.loadResult/deleteResult` を `Promise<StorageActionResult>` に統一
- `load` は `LOADED/ERROR` event、`delete` は `UPDATE/ERROR` event を待って結果確定
- `FileSelector` は load/delete を非同期 Result 経由で扱い、通知導線を save/export/import と同一化
- `SlideStorage.load` の parse 失敗時も `ERROR` event を dispatch し、Result へ反映
- `DocumentStorageUseCase` に event 待機タイムアウト（15秒）を追加し、未完了ハングを `STORAGE_IO_ERROR` として失敗化

### 6.12 非同期待機ロジックの共通化（2026-06-10 追記）
- `DocumentStorageUseCase` に `waitForStorageCompletion` を追加
- `performLoad` / `performDelete` の event 待機・timeout・cleanup を共通化
- 重複コードを削減し、将来の操作追加時に同一パターンで拡張可能に整理

### 6.13 UseCase イベントAPIの意味論化（2026-06-10 追記）
- `DocumentStorageUseCase` に `onLoading/onLoaded/onUpdated/onError` を追加
- `Viewer` / `FileSelector` は `StorageEventType` 直接依存を減らし、UseCase の意味論 API を利用
- UI 層から storage event 名の知識を剥離し、境界責務を明確化

### 6.14 Result通知処理の共通化（2026-06-11 追記）
- `src/useCase/storageActionResult.ts` に `handleStorageActionResult` を追加
- `Viewer` の save/export/import は共通ヘルパー経由で失敗通知を処理
- `FileSelector` の load/delete も同ヘルパー経由に統一
- これにより UI 層の通知ロジック重複を削減し、Result モデル拡張時の追従箇所を最小化

### 6.15 ストレージエラー通知文言の統一（2026-06-11 追記）
- `DocumentStorageUseCase.getErrorNoticeMessage` を追加し、`unknown` エラーから通知文言を解決
- `Viewer` の `onError` は event detail の生メッセージではなく、エラーコード基準の文言を表示
- これにより parse/version/missing asset などの通知品質を一定化し、文言揺れを抑制

### 6.16 feature gate 拒否時の明示通知（2026-06-11 追記）
- `Viewer` に拒否通知ヘルパーを追加し、保存系の gated 操作で即時通知を表示
- 対象: `new/save/export/zip/import`
- これにより mobile pwa 等での拒否操作が「無反応」に見える問題を軽減

### 6.17 確認ダイアログ分岐の共通化（2026-06-11 追記）
- `Viewer` に変更破棄確認ヘルパーを追加し、`new/import` の分岐条件を統一
- `save` の上書き確認もヘルパー化し、UI フローの追跡性を向上
- これにより strict mode と変更有無判定の重複実装を削減

### 6.18 権限チェック分岐の共通化（2026-06-11 追記）
- `Viewer` に `ensureAllowed` を追加し、操作ごとの gate 判定と通知を統一
- 対象: `new/export/save/zip/import`
- これにより保存系UIハンドラの早期return分岐を簡潔化

### 6.19 Viewer 起動処理の分割（2026-06-11 追記）
- `Viewer` の constructor から storage 初期化処理を `initializeDocumentStorage` へ抽出
- I/Oイベント登録を `setupIOBindings` と複数の小メソッドへ分割
- これにより起動シーケンスの責務境界を明確化し、将来の差し替え点を把握しやすくした

### 6.20 スライドショー起動処理の分離（2026-06-11 追記）
- `Viewer` の `bindCommonIOHandlers` からスライドショー組み立て処理を抽出
- `buildSlideShowSlides` / `startSlideShowFromSelection` を追加し、表示系ロジックを独立化
- これにより I/O バインド層と表示実行層の責務を分離

### 6.21 共通I/Oバインドの責務分割（2026-06-11 追記）
- `bindCommonIOHandlers` を保存系・取込系・表示系・背景色更新の小メソッドへ分割
- `bindSaveAndExportHandlers` / `bindImportHandlers` / `bindSlideShowHandlers` / `bindBackgroundColorHandler` を追加
- これにより操作種別ごとの変更影響範囲を局所化

### 6.22 mode 依存初期化の分離（2026-06-11 追記）
- `Viewer` の edit mode 初期化を `initializeEditModeFeatures` へ抽出
- I/O 側の mode 分岐を `setupModeSpecificIOBindings` / `setupViewOnlyIOBindings` へ分離
- これにより `VIEW_AND_EDIT` と `VIEW_ONLY` の責務境界を明確化

### 6.23 権限ポリシー判定の集約（2026-06-11 追記）
- `Viewer` に `getPermissionPolicy` を追加し、mode/feture gate 起点の権限値を一元化
- `canEdit/canSave/canExport/canImport` は policy 参照のみとし、個別分岐を削減
- これにより権限制御仕様の変更時に修正箇所を1か所へ集約

### 6.24 起動シーケンス3段化（2026-06-11 追記）
- `Viewer` の constructor を `initializeRuntime` / `initializeControllers` / `initializeBindings` へ分割
- 起動順序を維持しつつ、初期化責務を段階ごとに可視化
- これにより起動時の副作用追跡と将来の差し替え（runtime/bindings）を容易化

### 6.25 beforeunload 登録処理の分離（2026-06-11 追記）
- `Viewer` の beforeunload 警告登録を `registerBeforeUnloadWarning` へ抽出
- 登録可否判定を `shouldRegisterBeforeUnloadWarning` へ分離
- これにより bindings 初期化フローの条件分岐を縮小し、起動時副作用の把握を容易化

### 6.26 モード遷移処理の分離（2026-06-11 追記）
- `Viewer.setMode` の `SELECT/EDIT` 遷移処理を `applySelectMode` / `applyEditMode` へ抽出
- UIクラス切替と edit view active 制御の責務を mode 別に整理
- これにより mode 拡張時の分岐追加を局所化

### 6.27 UseCase 公開イベントAPIの縮小（2026-06-11 追記）
- `DocumentStorageUseCase` から未使用の汎用 `addEventListener/removeEventListener` を削除
- UI 層は `onLoading/onLoaded/onUpdated/onError` の意味論APIのみを利用
- これにより UseCase 境界の意図しない event 名依存を防止

### 6.28 DOMセレクタ定数の集約（2026-06-11 追記）
- `Viewer` に `private static readonly SEL` を追加し、jQuery セレクタ文字列を1か所で管理
- `bindEditModeIOHandlers/bindSlideShowHandlers/bindSaveAndExportHandlers/bindImportHandlers/bindBackgroundColorHandler/setupViewOnlyIOBindings` が `SEL` を参照
- これにより HTML 側のクラス/ID 変更時の修正箇所を `SEL` 定数のみに限定

### 6.29 `progressBar` フィールド昇格・`obj` 型絞り込み（2026-06-11 追記）
- `Viewer.progressBar` をフィールドへ昇格し、メソッド間の引数渡しを排除
- `initializeRuntime` の戻り値を `void` に変更し、`initializeControllers` の `progressBar` 引数を削除
- `obj` 型を `any` → `JQuery` に絞り追加し、型安全性を向上

### 6.30 ViewerBridge 導入（2026-06-11 追記）
- `src/bridge/ViewerBridge.ts` を追加し、Viewer(jQuery)↔React の型付きイベントバスを実装
- Viewer から `slidesChanged/selectionChanged/savedFilesChanged/modifiedChanged/modeChanged` を emit
- `RuntimeShell` の MutationObserver ポーリングを廃止し、Bridge 購読ベースへ全面切り替え
- これにより React が DOM を直接監視する必要がなくなり、React 状態の信頼性が向上

### 6.31 ListViewController Bridge 統合（2026-06-11 追記）
- `addSlide/removeSlide/onSlideSort/selectSlide/set slides` から `slidesChanged/selectionChanged` を emit
- スライド追加・削除・並び替え・選択変化がリアルタイムで React に通知される

### 6.32 useViewerBridge hooks 追加（2026-06-11 追記）
- `src/bridge/useViewerBridge.ts` を追加し、4つのカスタム hooks を提供
  - `useViewerSlides` — スライド一覧 + 選択インデックス
  - `useViewerStorage` — 保存済みファイルタイトル一覧
  - `useViewerModified` — 変更フラグ
  - `useViewerMode` — 現在の Viewer mode
- 任意の React コンポーネントから Viewer 状態を 1行で購読可能になり、Phase 3 移行を加速

### 6.33 ViewerCommands 導入と RuntimeShell 操作の分離（2026-06-11 追記）
- `src/bridge/ViewerCommands.ts` を追加し、React から `Viewer.shared` の公開コマンドを呼び出す境界を追加
- `Viewer` に公開コマンドメソッド（slide/file/slideshow）を実装し、UI操作をメソッド呼び出しへ統一
- `ListViewController` に公開操作APIを追加し、スライド操作を DOM イベント経由ではなく Controller API で実行
- `RuntimeShell` は主要ボタン処理の `querySelector(...).click()` を撤去し、`ViewerCommands` + `useViewerBridge` ベースへ移行
- これにより React 側のコマンド実行経路から DOM セレクタ依存を大幅に削減

### 6.34 保存ファイル選択状態のBridge同期（2026-06-11 追記）
- `ViewerBridge` に `savedFileSelectionChanged` を追加
- `FileSelector` は dropdown更新・手動選択・up/down移動時に選択IDを bridge emit
- `Viewer.commandLoadSavedFile` でも選択IDを bridge emit し、React操作経路でも同期
- `RuntimeShell` は `useViewerSavedFileSelection` で選択状態を購読し、ローカル state 依存を削減
- これにより legacy UI と React Shell 間の保存ファイル選択ズレを抑制

### 6.35 保存ファイル操作の選択ベース化（2026-06-11 追記）
- `Viewer` に `selectedSavedFileId` を導入し、保存ファイル選択を controller 内部状態として保持
- `ViewerCommands` に `selectSavedFile/loadSelectedSavedFile/deleteSelectedSavedFile/selectNextSavedFile/selectPreviousSavedFile` を追加
- `RuntimeShell` は file id を毎回渡す方式から、選択状態 + 実行コマンド方式へ移行
- これにより React 側の file operation 導線が「選択」と「実行」に分離され、次段の FileSelector 置換が容易化

### 6.36 legacy FileSelector のコマンド経路統一（2026-06-11 追記）
- `FileSelector` は `DocumentStorageUseCase.load/delete` の直接呼び出しをやめ、`Viewer.shared.command*` を利用
- 対象操作: select change, `.load`, `.dispose`, `.fileSelect up/down`
- `savedFileSelectionChanged` 購読で legacy dropdown 表示を同期し、選択状態の責務を Viewer に集約
- これにより legacy UI と React UI が同一コマンド経路を使うようになり、保存系移行の分岐を削減

### 6.37 FileSelector の Bridge同期専用化（2026-06-11 追記）
- `FileSelector` から `DocumentStorageUseCase` 依存を削除
- `savedFilesChanged` 受信時に legacy select options を再構築し、`savedFileSelectionChanged` で選択表示を同期
- `Viewer.setupIOBindings` は `new FileSelector()` のみを行い、保存データ取得責務を `Viewer` の storage event 処理へ集約
- これにより legacy 層のデータ責務が縮小し、Phase3 での FileSelector 撤去準備が進展

### 6.38 legacy 保存操作UIのミラー専用化（2026-06-11 追記）
- `FileSelector` から `.load/.dispose/.fileSelect up/down/select change` の操作ハンドラを除去
- `select.filename` と関連ボタンを disable + pointer-events none に設定
- これにより保存操作の実行導線は RuntimeShell (`ViewerCommands`) に一本化され、legacy 側は表示ミラー責務のみを保持

### 6.39 legacy 保存UIの撤去開始（2026-06-11 追記）
- `Menu` から `select.filename` / `.fileSelect` / `.save` / `.load` / `.dispose` を除去
- `Viewer.setupIOBindings` から `new FileSelector()` を削除し、legacy保存UIの起動経路を停止
- これにより保存系の実行導線は `RuntimeShell + ViewerCommands` のみとなり、legacy保存UI撤去フェーズへ移行

### 6.40 FileSelector 撤去完了（2026-06-11 追記）
- 未参照となった `src/viewController/file/FileSelector.ts` を削除
- `css/index.css` の `#menu button.fileSelect` と `applyFeatureGate` の `.dispose` 制御を削除し、撤去後の死んだコードを整理
- これにより保存系 legacy UI は表示・実行ともにコードベースから除去され、保存導線は RuntimeShell 側へ完全移行

### 6.41 保存UI撤去後のDOM/セレクタ整理（2026-06-11 追記）
- `Menu` の空プレースホルダ `<div>` を削除し、撤去後のUI構造を簡素化
- `Viewer` の `.save` click バインドを削除し、保存操作を `ViewerCommands` 経由に一本化
- `applyFeatureGate` から `.save` 制御を削除し、存在しない legacy ボタンへの制御を解消

### 6.42 ファイル操作DOM依存の削減（2026-06-11 追記）
- `Menu` の `startSlideShow` / `files` pulldown / `input.import` を除去
- `Viewer` の legacy セレクタバインド（`.new/.export/.zip/.startSlideShow/button.import/input.import`）を削除
- `commandOpenImportDialog` は動的 file input 生成で import を実行し、DOM常駐input依存を解消
- `RuntimeShell` に `Export Img` を追加し、`commandExportImages` 経由で画像書き出し機能を継続

## 7. 現行 MVVM からの対応
- 旧 Model -> `documentStore` ドメインモデル
- 旧 VMUI（双方向バインド） -> React フォーム + selector + action dispatch
- 旧 ViewController -> 画面単位コンテナ + useCase hooks

## 8. 同期・整合ルール
- `selectedSlideId` が消えた場合は次候補へ選択移動
- `selectedLayerId` が無効化された場合は選択解除
- `mode=mobilePwa` の間は編集系 action を reject する
- センシティブ未認証時は復号済み画像を store に展開しない

## 9. エラー処理
- 永続化失敗
  - UI 通知 + リトライ導線
- 復号失敗
  - 認証状態を `failed` へ遷移
  - コンテンツ表示停止
- 互換性不一致
  - バージョン判定で読み込み拒否し、理由を表示

## 10. テスト観点
- reducer/store 単体テスト
- command undo/redo 整合テスト
- adapter モックによる保存読込テスト
- mode gate の拒否動作テスト
- センシティブ認証フローの正常/異常テスト

## 11. 段階導入計画
- Step 1: `uiStore` + `mode` 制御導入
- Step 2: `documentStore` と閲覧系 action 移行
- Step 3: `historyStore` と編集 command 移行
- Step 4: Adapter 層置換（保存/入出力）
- Step 5: `securityStore` とセンシティブ処理導入

## 12. 受け入れ基準
- 編集操作の undo/redo が既存同等である
- 保存/読込互換が維持される
- mobile pwa mode で編集 action が実行されない
- センシティブ未認証時に機密表示が発生しない
