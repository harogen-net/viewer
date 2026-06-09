# Phase2 リスク制御メモ

## 目的
保存/読込経路の分離中に発生するデータ破損・回帰リスクを抑止する。

## 1. データ破損時のロールバック手順
1. 直近コミットを特定する（StorageAdapter/UseCase 変更単位）。
2. 影響範囲を切り分ける（save, load, import, export, delete）。
3. 旧経路フォールバックを有効化する。
: `createStorageAdapter()` で `LegacySlideStorageAdapter` を返す構成を維持して即時切戻し。
4. 破損データの再現 fixture で再テストし、原因を特定する。
5. 修正は小さいコミットに分割して再投入する。

## 2. 旧経路フォールバック方針
- 方針: Phase2 中は常に旧実装 (`SlideStorage`) を最終フォールバックとして保持する。
- 実装ポイント:
  - `src/storage/createStorageAdapter.ts`
  - `src/storage/LegacySlideStorageAdapter.ts`
- 判定基準:
  - save/load/import/export のいずれかで P0/P1 回帰が出た場合、
    新経路機能追加を停止して旧経路に戻す。

## 3. 影響範囲レビュー（実施済み）
- 保存UI:
  - save button (`.save`) -> `DocumentStorageUseCase.save`
- 読込UI:
  - file selector (`select.filename`, `.load`) -> `DocumentStorageUseCase.load`
- インポート:
  - file input (`input.import`) -> `DocumentStorageUseCase.import`
- エクスポート:
  - export button (`.export`) -> `DocumentStorageUseCase.export`
- 削除:
  - dispose button (`.dispose`) -> `DocumentStorageUseCase.delete`

## 4. 運用ルール
- 変更前後で fixture の round-trip を最低1ケース実施する。
- 失敗時はエラー分類（UNSUPPORTED_VERSION / PARSE_ERROR / MISSING_ASSET / STORAGE_IO_ERROR）で記録する。
- P0（データ破損）発生時は新規機能開発を停止し、復旧を最優先にする。
