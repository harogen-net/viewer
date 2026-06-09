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
- `fixtures/legacy/*.png`
- `fixtures/sensitive/*.hvd`

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
