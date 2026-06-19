# センシティブモード詳細仕様

## 目的
ドキュメント単位の機密保護機能（センシティブモード）を、React 移行時に正式仕様として定義する。

## 関連ドキュメント
- docs/function-list.md
- docs/migration-roadmap.md
- docs/mode-spec.md
- docs/state-management-design.md

## 1. 機能概要
- 各ドキュメントは `isSensitive` を持つ。
- `isSensitive=true` の場合、パスワード入力に成功するまで内容を表示しない。
- 保存時は画像データを暗号化して保存する。
- 読込時は認証成功後に復号して描画する。

## 2. 対象データ
- 暗号化対象（必須）
  - 画像データ（imageData）
- 暗号化対象（任意、将来拡張）
  - テキスト内容、レイヤープロパティ

注記:
- 初版は現要件に合わせて「画像データ」を必須対象とする。

## 3. 文書メタ仕様
保存フォーマットに以下を追加する。

- `isSensitive: boolean`
- `security.version: number`
- `security.kdf: string`（例: PBKDF2）
- `security.kdfIterations: number`
- `security.salt: string`（base64）
- `security.cipher: string`（例: AES-GCM）
- `security.iv: string`（base64）
- `security.hashHint: string`（検証用メタ。平文パスワードは保存しない）

## 4. 暗号方式（推奨）
要件文に「SHA ベース」があるため、以下を推奨する。

- 鍵導出
  - PBKDF2-HMAC-SHA-256
  - 入力: ユーザーパスワード + salt
- 本暗号
  - AES-256-GCM
  - 画像データ JSON を暗号化
- 追加検証
  - パスワード検証/整合確認に SHA-256 を利用

理由:
- SHA 単体は暗号ではなくハッシュのため、復号が必要な要件には不十分。
- 「SHA ベース」は KDF/検証用途で満たし、実暗号は AES-GCM を使う。

## 5. 保存フロー
1. ユーザーが `isSensitive=true` で保存要求
2. パスワード入力ダイアログを表示
3. salt/iv を生成
4. PBKDF2-SHA256 で鍵導出
5. imageData を暗号化して保存データへ格納
6. 平文 imageData は保存しない
7. `isSensitive` と `security.*` メタを保存

## 6. 読込フロー
1. ファイル読込
2. `isSensitive=false` なら通常読込
3. `isSensitive=true` なら認証ダイアログ表示
4. 入力パスワードから鍵導出
5. 復号成功なら描画開始
6. 復号失敗なら表示しない（エラーメッセージ表示）

## 7. UI/UX 仕様
- 認証ダイアログ
  - パスワード入力欄
  - 表示/非表示トグル
  - 実行/キャンセル
- 失敗時
  - 「パスワードが正しくないか、データが破損しています。」
  - 再試行可能
- セキュア配慮
  - パスワードは永続保存しない
  - メモリ保持は最短時間
  - ログへ出力しない

## 8. モード別挙動
- browser mode
  - 認証成功後は編集・閲覧可能（通常のモード制約に従う）
- mobile pwa mode
  - 認証成功後は閲覧のみ（編集不可）

## 9. 失敗時ポリシー
- 復号失敗
  - 画像表示しない
  - 文書をロック状態のまま維持
- メタ不正
  - 「未対応または不正なセキュリティ形式」として読込拒否
- 連続失敗
  - 制限回数は将来拡張（初版は無制限）

## 10. 互換性
- `isSensitive` 未定義データは `false` とみなす。
- 旧データの読込互換を維持する。
- `security.version` により将来の方式変更へ対応する。

## 11. 実装インターフェース（案）
- `encryptImagePayload(payload, password): EncryptedPayload`
- `decryptImagePayload(payload, password): ImagePayload`
- `isSensitiveDocument(meta): boolean`
- `unlockSensitiveDocument(doc, password): UnlockResult`

## 12. 受け入れ基準
- センシティブ ON 文書は認証成功時のみ表示される。
- 認証失敗時に画像が一切表示されない。
- 非センシティブ文書の既存読込が壊れない。
- パスワードや平文画像データがログへ出ない。
