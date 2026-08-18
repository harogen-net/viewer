# Phase1 受け入れ基準メモ

> **歴史的記録**: Phase 1 の完了記録。当時の記述をそのまま残しており、**現状ではない**。
> ファイル名・用語は当時のもので、既に存在しないパスやモードの旧称を含む。
> 現在の構成は [function-list.md](function-list.md)、モード用語は [mode-spec.md](mode-spec.md) §1 を見ること。

## 目的
Phase1（App シェル + 閲覧基盤 React 化）の受け入れ基準と確認観点を定義する。

## 受け入れ基準
- React エントリが導入され、既存UIと共存できること。
- browser/mobile 判定と feature gate が仕様どおりに機能すること。
- PCブラウザで一覧表示とスライドショー起動が可能であること。
- mobile pwa mode で閲覧専用制御が有効であること。

## 確認観点
- Runtime shell の表示・操作導線
- mode 判定（query override / standalone 判定）
- readonly ガード（UI・操作レベル）
- 既存機能との差分がドキュメント化されていること

## 次フェーズ連携条件
- 未解決課題の優先度を明確化する。
- Phase2 で扱うデータ境界（StorageAdapter/UseCase）を固定する。
- 検証結果は test-plan に集約する。

## 参照
- docs/migration-roadmap.md
- docs/mode-spec.md
- docs/state-management-design.md
- docs/test-plan.md
