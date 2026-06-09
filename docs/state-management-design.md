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
  3. import/export options とエラー型の型安全化（次段）

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
