# Phase2 着手チェックリスト

## 目的
Phase2（データ層・永続化の分離）を迷いなく開始するための事前チェック項目。

## A. 仕様確定
- [x] Storage Adapter の責務を確定（save/load/import/export）
- [x] 互換仕様（v2+）を実装方針へ反映
- [x] センシティブ対応の Adapter 境界を定義（将来拡張含む）

## B. 既存コード切り出し方針
- [x] SlideStorage の public API と内部依存を棚卸し
- [x] Viewer 直結の保存処理呼び出し箇所を一覧化
- [x] Adapter 経由に置き換える優先順を決定

## C. テスト準備
- [ ] 互換テスト用 fixture 配置を決定
- [ ] round-trip テスト観点を最小セットで定義
- [ ] エラー分類（UNSUPPORTED_VERSION など）の検証観点を確定

## D. リスク制御
- [ ] データ破損時のロールバック手順を確認
- [ ] 旧経路フォールバック可否を明文化
- [ ] 影響範囲レビュー（保存/読込 UI・インポート）を実施

## E. 着手タスク（初動）
- [x] `StorageAdapter` interface を新規作成
- [x] `LegacySlideStorageAdapter` を作成し現行 SlideStorage をラップ
- [x] Viewer 側の保存/読込呼び出しを Adapter 経由へ差し替え
- [x] docs/state-management-design.md に Adapter 実装詳細を追記

## 完了判定
- [ ] 上記 A-E が全て完了
- [x] Phase2 の最初のコミット単位が定義されている
