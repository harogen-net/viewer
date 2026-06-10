# React 移行ロードマップ（段階計画）

## 目的
本ドキュメントは、現行 jQuery アプリを React へ段階的に移行する際の実行順序、完了条件、ロールバック方針を定義する。
機能の棚卸しは [docs/function-list.md](docs/function-list.md) を参照する。

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
  - 反映コード:
    - `.github/workflows/phase2-check.yml`
    - `src/storage/StorageAdapter.ts`
    - `src/storage/LegacySlideStorageAdapter.ts`
    - `src/storage/createStorageAdapter.ts`
    - `src/useCase/DocumentStorageUseCase.ts`
    - `src/useCase/storageActionResult.ts`
    - `src/Viewer.ts`
    - `src/viewController/file/FileSelector.ts`
    - `src/utils/SlideStorage.ts`

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
