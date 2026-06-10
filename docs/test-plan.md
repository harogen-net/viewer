# テスト計画（段階移行）

## 目的
段階移行中の回帰を防ぎ、browser mode / mobile pwa mode / センシティブモードを含む品質を保証する。

## 関連ドキュメント
- docs/function-list.md
- docs/migration-roadmap.md
- docs/mode-spec.md
- docs/state-management-design.md
- docs/sensitive-mode-spec.md
- docs/data-compatibility-spec.md

## 1. テスト戦略
- フェーズごとに「最小受け入れ」を定義してゲート運用する。
- 単体テスト + 結合テスト + E2E の三層で実施する。
- データ互換テストは毎フェーズで自動実行する。

## 2. テスト対象マトリクス
### 2.1 実行環境
- PC ブラウザ（Chrome 最新）
- スマホ PWA（iOS Safari PWA / Android Chrome PWA）

### 2.2 モード
- browser mode
- mobile pwa mode

### 2.3 画面向き
- 横起動
- 縦起動（transform フォールバック経路）

### 2.4 セキュリティ
- 非センシティブ文書
- センシティブ文書（認証成功/失敗）

## 3. フェーズ別テストゲート
### Phase 1 ゲート
- 起動判定が仕様通り
- browser mode で閲覧 + スライドショー起動可能
- mobile pwa mode で編集 UI が無効

### Phase 2 ゲート
- hvd/hvz/png の読込成功
- 保存 -> 再読込でデータ同一性（主要項目）

### Phase 3 ゲート
- 主要編集操作（移動/拡縮/回転/反転）成功
- Undo/Redo の整合

### Phase 4 ゲート
- センシティブ文書の認証成功時のみ表示
- 認証失敗時の非表示保証

### Phase 5 ゲート
- スマホ縦起動でも横 UX が成立
- タップ座標ずれなし

### Phase 6 ゲート
- 旧実装除去後も回帰なし

## 4. テストケース（抜粋）
### 4.1 モード判定
- `?mode=mobile` で強制 mobile pwa mode になる
- `?mode=browser` で強制 browser mode になる
- standalone + スマホで mobile pwa mode になる

### 4.2 機能ゲート
- mobile pwa mode でレイヤー編集 action が reject される
- mobile pwa mode で削除・上書き操作が実行されない

### 4.3 画面向き
- 縦起動時に transform フォールバックが適用される
- orientationchange 後にレイアウトが再計算される
- ノッチ端末で UI が欠けない

### 4.4 データ互換
- v2 以降の hvd を読込できる
- v2 以降の hvz を読込できる
- 埋め込み png からデータ抽出できる
- round-trip（読込 -> 保存 -> 読込）で主要プロパティが一致

### 4.5 センシティブ
- 正しいパスワードで復号表示される
- 誤パスワードで表示されない
- 未認証のまま画像データへアクセスできない

### 4.6 履歴
- 編集 100 ステップで上限管理が機能する
- Transaction の undo/redo で整合が崩れない

## 5. 自動化方針
- 単体
  - reducer/command/adapter を中心に実装
- 結合
  - ストア + usecase の結合検証
- E2E
  - 主要シナリオ（閲覧、編集、保存読込、センシティブ解錠）

## 6. テストデータセット
- `fixtures/legacy/v2/*.hvz`
- `fixtures/legacy/v2/*.hvd`
- `fixtures/legacy/png/*.png`
- `fixtures/sensitive/*.hvd`

### 6.1 Phase2 最小 fixture セット
- `fixtures/legacy/v2/compat_v2_minimal.hvd`
- `fixtures/legacy/v2/compat_v2_minimal.hvz`
- `fixtures/legacy/png/compat_png_embedded_minimal.png`
- `fixtures/sensitive/sensitive_locked_sample.hvd`

実行チェック:
- `npm run check:phase2-fixtures`
- 期待値: 0 exit（不足ファイルなし・各 fixture が最小サイズ以上）
- NG時: missing/tooSmall の内訳と summary が表示される
- 総合実行: `npm run check:phase2`

互換チェック（実データ解析）:
- `npm run gen:phase2-png-fixture`
- `npm run check:phase2-compat`
- 期待値: hvd/hvz/png埋め込みの解析が成功し、version と slide 数の整合が取れる

### 6.2 round-trip 最小観点（Phase2）
- 入力: `compat_v2_minimal.hvd`
- 手順: load -> save(override) -> load
- 検証項目:
  - `ViewerDocument.bgColor`
  - slide 数
  - 各 slide の `durationRatio/joining/disabled`
  - layer 数
  - 先頭 layer の transform（`transX/transY/scaleX/scaleY/rotation`）

実行チェック（fixture間整合の自動検証）:
- `npm run check:phase2-core-fields`
- 期待値: hvd/hvz/png 埋め込みの主要項目（bgColor, slide数, 先頭slide項目, 先頭layer transform）が一致

構造等価チェック（fixture間整合の強化）:
- `npm run check:phase2-structure`
- 期待値: hvd/hvz/png 埋め込みの JSON 構造全体（キー順を正規化後）が一致
- NG時: 最初に不一致となった JSON path（例: `$.slideData[0].layers[1]`）が出力される
- 実行時: `artifacts/phase2/structure-check-report.json` に検証結果（OK/NG と mismatch詳細）を出力
- 差分詳細: source ごとに最大 `PHASE2_STRUCTURE_MAX_DIFFS` 件（デフォルト 10 件）の差分を記録

CI実行時のレポート収集:
- `.github/workflows/phase2-check.yml` で `artifacts/phase2/` を artifact として保存
- 期待値: 失敗時も差分レポートをダウンロードして原因を特定できる

レポート整合チェック:
- `npm run check:phase2-reports`
- 期待値: structure/error-case/error-fixture の3レポートが存在し、スキーマと `ok === true` を満たす
- 追加検証: error-case / error-fixture の label 集合が期待値と一致する
- 実行時: `artifacts/phase2/phase2-report-summary.json` に統合サマリーを出力

センシティブ fixture 最小妥当性:
- `npm run check:phase2-sensitive`
- 期待値: `isSensitive === true` かつ version/slideData が妥当

エラーケース最小妥当性:
- `npm run check:phase2-error-cases`
- 期待値: unsupported version / imageData欠落 / PNG署名不正 などの失敗系を検知できる
- 実行時: `artifacts/phase2/error-case-report.json` にケース別の期待値・実際メッセージを出力

異常fixture妥当性（実ファイルベース）:
- `npm run check:phase2-error-fixtures`
- 対象: `fixtures/error/unsupported_v1_sample.hvd`, `fixtures/error/broken_payload_sample.hvz`, `fixtures/error/broken_embed_sample.png`
- 期待値: 各fixtureで想定した失敗が検出される
- 実行時: `artifacts/phase2/error-fixture-report.json` にfixture別結果を出力

### 6.3 エラー分類（Phase2）
- `UNSUPPORTED_VERSION`
  - v1 または version 未定義データを読込時に reject
- `PARSE_ERROR`
  - JSON parse 失敗、zip 展開失敗、PNG 埋め込み抽出失敗
- `MISSING_ASSET`
  - `imageData` 不足により画像復元に失敗
- `STORAGE_IO_ERROR`
  - IndexedDB read/write/delete の失敗
- `PERMISSION_DENIED`
  - feature gate により save/export/import/delete を拒否

注記:
- 実ファイル配置は実装時にプロジェクト構成へ合わせる。

## 7. 非機能テスト
- 初期表示時間
- スライドショー遷移の体感遅延
- 大量スライド/大量画像でのメモリ使用量

## 8. 不具合運用
- 優先度
  - P0: データ破損/表示漏えい
  - P1: 主要機能停止
  - P2: 操作性/表示崩れ
- 再現情報
  - モード、端末、向き、入力データ、手順を必須記録

## 9. 受け入れ基準（総合）
- フェーズゲートを連続で通過する。
- P0 未解決ゼロ。
- P1 は合意済み件のみ残件許容。
- browser/mobile の必須シナリオが全て成功する。
