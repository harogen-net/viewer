# データ互換仕様（保存形式・移行ルール）

## 目的
React 移行後も既存データを読み書き可能にし、互換性を保証するための仕様を定義する。

## 関連ドキュメント
- docs/function-list.md
- docs/migration-roadmap.md
- docs/sensitive-mode-spec.md

## 1. 対象形式
- `.hvd`（JSON）
- `.hvz`（zip + hvd）
- `.png`（埋め込みデータ付き）

## 2. 互換性方針
- 後方互換を最優先とする。
- サポート対象は v2 以降とする（v1 は非対応）。
- 新規フィールドは追加互換（無視可能）で導入する。
- 破壊的変更は `version` を上げ、変換処理を必須とする。

## 3. バージョン管理
- ルートに `version` を保持
- 読込時は以下の分岐
  - `version` 未定義または v1: 非対応として読込拒否
  - v2 以上の対応版: 通常パーサ（必要に応じて補正）
  - 将来版（未対応）: 明示エラーで拒否

## 4. 互換対象フィールド
- Document
  - `screen.width`, `screen.height`, `bgColor`, `createTime`, `editTime`, `title`
  - 追加: `isSensitive`, `security.*`
- Slide
  - `id`, `durationRatio`, `joining`, `disabled`, `layers`
- Layer
  - 共通 transform/opacity/visible/locked/shared
  - ImageLayer: `imageId`, `clipRect`, `isText`, `name`
  - TextLayer: `text`
- Assets
  - `imageData[imageId] = dataURL or encryptedPayload`

## 5. 読込互換ルール
- 旧 `images` 配列形式は `layers` へ変換
- 欠損フィールドは既定値補完
  - 例: `durationRatio=1`, `disabled=false`
- 不正値はバリデーション後に安全な既定値へフォールバック

## 6. 保存互換ルール
- 既存互換を壊さない JSON 構造を維持
- センシティブ ON のときのみ `security.*` と暗号化 payload を出力
- センシティブ OFF は従来出力と等価

## 7. 変換（Migration）仕様
- `migrate(data): MigratedData`
- 変換は段階適用
  - v2 -> v3
  - v3 -> current
- 各段階で不変条件検証
  - スライド数
  - レイヤー数
  - imageId 参照整合

## 8. 検証ルール
- Schema 検証
  - 必須キーの存在
  - 型検証
- 参照整合検証
  - 画像レイヤーの imageId が `imageData` に存在する
- セキュリティ検証
  - `isSensitive=true` なら `security.*` 必須

## 9. エラー分類
- `UNSUPPORTED_VERSION`
- `INVALID_SCHEMA`
- `BROKEN_REFERENCE`
- `DECRYPTION_FAILED`
- `ZIP_PARSE_FAILED`

各エラーはユーザー向けメッセージへ変換して表示する。

## 10. API（案）
- `parseHvd(text): ParsedDoc`
- `serializeHvd(doc): string`
- `loadHvz(blob): ParsedDoc`
- `saveHvz(doc): Blob`
- `loadEmbeddedPng(blob): ParsedDoc`
- `saveEmbeddedPng(doc): Blob`
- `migrateToCurrent(raw): CurrentDoc`

## 11. 受け入れ基準
- 既存サンプルデータ（hvd/hvz/png）を全件読込できる。
- React 版で保存したデータを v2 以降互換範囲で読込できる（許容範囲を明示）。
- センシティブ ON/OFF の両形式で round-trip が成立する。

## 12. 運用ルール
- 保存形式変更時は必ず `version` を更新
- 変更時は互換テストデータセットを更新
- 互換破壊がある場合はリリースノートへ明記
