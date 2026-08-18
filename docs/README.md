# docs 索引

このディレクトリには**現役の仕様書**と**歴史的記録**が混在している。
歴史的記録は当時の記述をそのまま残しているため、存在しないファイル名や用語の旧称を含む。
各ファイルの冒頭にどちらかが明示されている。

## まず見るもの

| 知りたいこと | 見るファイル |
| --- | --- |
| モードの用語（PCモード / スマホモード / 一覧モード / 編集モード） | [mode-spec.md](mode-spec.md) §1 |
| アプリにどんな機能があるか | [function-list.md](function-list.md) |
| 現行の主な実装ファイル | [function-list.md](function-list.md) 末尾 |

## 現役の仕様書

| ファイル | 内容 |
| --- | --- |
| [mode-spec.md](mode-spec.md) | **モードの唯一の定義**（用語 / 起動判定 / 機能可否 / 書込権限 / 画面向き） |
| [function-list.md](function-list.md) | 機能一覧。モードの記述は持たず mode-spec を参照する |
| [test-plan.md](test-plan.md) | テスト方針と観点 |
| [app-lock-spec.md](app-lock-spec.md) | アプリロック（スマホの起動ゲート）。§10 に実機検証の残りがある |
| [sensitive-mode-spec.md](sensitive-mode-spec.md) | センシティブモード（文書単位のパスワード保護） |
| [data-compatibility-spec.md](data-compatibility-spec.md) | 保存形式の互換要件（レガシーと byte-equal） |
| [state-management-design.md](state-management-design.md) | 状態管理の設計方針 |
| [cloud-sync-plan.md](cloud-sync-plan.md) | クラウド同期の計画（**未着手**） |

## 歴史的記録（現状ではない）

jQuery + MVVM 実装から React へ移行した際の計画・経過・振り返り。
現在のコードを知る目的では読まないこと。

| ファイル | 内容 |
| --- | --- |
| [migration-closeout-v4.md](migration-closeout-v4.md) | 移行完了時の振り返り（結果と学び） |
| [migration-postmortem.md](migration-postmortem.md) | 移行途中の反省文 |
| [migration-roadmap-v4.md](migration-roadmap-v4.md) | v4 計画（forward-only build。これで完了した） |
| [migration-roadmap-v3.archived.md](migration-roadmap-v3.archived.md) | v3 計画（per-Group swap。破綻して v4 へ転換） |
| [migration-roadmap-v2.archived.md](migration-roadmap-v2.archived.md) | v2 計画 |
| [migration-roadmap.md](migration-roadmap.md) / [migration-roadmap.archived.md](migration-roadmap.archived.md) | v1 計画 |
| [phase1-closeout.md](phase1-closeout.md) / [phase2-kickoff-checklist.md](phase2-kickoff-checklist.md) / [phase2-risk-control.md](phase2-risk-control.md) | 各 Phase の記録 |
| [state-management-design.archived.md](state-management-design.archived.md) | 状態管理設計の旧版 |

## 書くときのルール

- **モードの定義を他の文書に写さない。** mode-spec.md §1 だけが定義で、他は参照する
  （実際に function-list に写した記述が古くなり、実装を誤る原因になった）。
- 実装ファイル名を書くときは、その時点で実在することを確認する。
- 完了した計画書は書き換えず、冒頭に歴史的記録であることを明示して残す。
