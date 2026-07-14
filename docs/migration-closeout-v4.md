# 移行クローズアウト (v4 Forward-only build 完了振り返り)

> 作成日: 2026-07-03
> 完了コミット: `15398fc4`（Group E: レガシー一括削除 + entrypoint 統合）
> 位置づけ: [migration-postmortem.md](migration-postmortem.md) は移行“途中”の反省文（§4 に残作業見立て）。本書は **v4 の完了時点** の振り返り。方針は [migration-roadmap-v4.md](migration-roadmap-v4.md)。

---

## 0. 結果サマリ

jQuery + EventDispatcher + MVVM (view/viewController/viewModel) ベースのレガシー実装を、React 18 / Zustand 5 / Mantine 7 の新モードへ全面移行し、**レガシー一式を物理削除して単一 entrypoint へ統合**した。Group E (最終フェーズ) 完了をもってマイグレーション完了とする。

| 指標 | 目標 (roadmap-v4 §1) | 結果 | 判定 |
|---|---|---|---|
| jQuery 参照 | 0 | 0 | ✅ |
| EventDispatcher / PropertyEvent | 0 | 0（実コード。説明コメント5件のみ） | ✅ |
| view / viewController / viewModel | 全削除 | 全削除 | ✅ |
| createRoot 呼び出し | 1 | 1（`src/main.tsx`） | ✅ |
| tsc / test / build | green | 0 error / 589 pass / build OK | ✅ |
| src+tests 行数 | < 6,500 | **21,853**（src 79f/11,250 + tests 49f/10,603） | ❌（後述） |

Group E 単体の規模: **43 ファイル変更 / +60 / -8,360 行**（37 ファイル削除）。

---

## 1. うまくいったこと

### 1.1 「forward-only build + 最終 bulk delete」への方針転換が正解だった
v3 の per-Group swap は「新側が clean に組めない」副作用で破綻し v4 で forward-only に転換した（roadmap-v4 §0）。結果、**Group E の削除は機械的に成立**した。決め手は §0-10（新側内製・レガシー import 禁止）の徹底で、削除直前の検証で **新モード (components/hooks/state) が legacy を 1 箇所も import していない**ことを確認できたため、37 ファイルを消しても新アプリは無傷だった。

### 1.2 パリティを「仕様書ベース」で機械的に突き合わせた
完了判定を主観でなく [function-list.md](function-list.md) §1〜13 との突き合わせで行った。5 並列の監査で全機能の実装状況を ✅/⚠️/❌ 化し、**実質的な欠落は1件のみ**（コンテキストメニュー「このスライドのみ有効化」）と特定 → 即修正。「動いてるように見える」と「仕様網羅」を分けて確認できた。

### 1.3 byte-equal 保証をテスト移設で維持した
保存形式の byte-equal 厳密要件（§0-9）は、削除される legacy `SlideStorage` に依存した P0 テストが担保していた。これを**削除前に新コーデック (`storageCodec`) の parse→serialize byte-equal 検証へ付け替え**、fixture 全4件（.hvd/.hvz/.png）で byte-equal を確認してから legacy を消した。保証を一瞬も落とさずに移行できた。

### 1.4 削除後に依存も剪定できた
legacy 撤去で不要化した `jquery` / `jquery-ui` / `crypto-js` / `matrixgl` / `stackblur-canvas` / `uuid` / `@fortawesome` / `sass` / `ts-loader` 等を package.json から除去し、vite の jQuery inject プラグインも撤去。ビルド時間も短縮（新側は Web Crypto / @tabler/icons へ内製移行済みだったため副作用なし）。

---

## 2. 想定と違ったこと・学び

### 2.1 LOC 目標 (< 6,500) は初期見積りが実態と大きく乖離していた
roadmap-v4 (2026-06-20) の起点 src ~8,331 行・終点 < 6,500 という数字に対し、完了時は **src 11,250 + tests 10,603 = 21,853 行**。これは削除の失敗ではなく、**Group C/D の実装が見積りより遥かに大きかった**ことによる:
- React + Mantine + 明示的型 + hook/component 分離は、簡潔な jQuery より冗長になりやすい。
- テストを 49 ファイルまで手厚く積んだ（§0-6 の test 同期を厳守した結果）。

**学び**: LOC を KPI に据えるなら、build フェーズ中に実測で継続更新すべきだった。初期見積りの絶対値を終点条件に固定したのは筋が悪い。数字に合わせてコードを削るのは本末転倒なので、**目標値の方を実態に合わせて改訂する**のが正しい。

### 2.2 entrypoint 方針が roadmap 記述と乖離していた
roadmap は「既定=legacy、`?new=1` で新側」を前提にしていたが、実コードは途中で **「既定=新側、`?legacy=1` で legacy」へ反転**済みだった（`?new=1` は撤去済み）。ドキュメントが実装の進行に追随していなかった。**学び**: 方針を変えたら roadmap 側も同期更新する（本書はその是正でもある）。

### 2.3 「net-new 要件」を完了判定に混ぜない、という基準が要った
function-list には mobile PWA モード / センシティブ暗号化が「追加の移行要件」として載るが、**どちらも jQuery 段階で未実装**（sensitive はフラグのみ）。当初これを未達扱いしかけたが、「完了判定 = legacy 実在機能のパリティ再現のみ」とスコープを確定させた（mobile は今後 React ベースで追加していく net-new）。**学び**: 「移行の完了」と「新規機能の追加」を最初に線引きしておく。

### 2.4 ツールチェーンのバージョン skew に足を取られた
`@/` エイリアス移行時、tsconfig に `ignoreDeprecations: "6.0"` が入ったが CLI の TypeScript 5.6.3 はこれを拒否（IDE 同梱 TS は許容）。CLI/IDE の TS バージョン差で `tsc` が通らない事象。最終的に tsconfig をモダン化（`baseUrl` 廃止・`moduleResolution: bundler`・`ignoreDeprecations` 削除）して両環境で解消。**学び**: 設定変更時は CLI と IDE 双方で `tsc` を通す。

### 2.5 コメントアウト残骸・stale コメントが散在していた
合理化フェーズでコメントアウトされた旧 JSX ブロックを複数除去。また削除済み legacy パスを参照する説明コメントが5件残存（無害だが stale）。**学び**: 「後で消す」コメントアウトは溜まる。build 同期で消す。

---

## 3. 検証アプローチ（再現可能な型）

本移行の後半で有効だった検証パターン:
- **fan-out 監査**: パリティ突き合わせも合理化候補の洗い出しも、担当領域を分割した並列調査 → 中央で証拠付きに統合。主観でなく file:line ベースで判断できた。
- **削除前ゲート**: 「新モードが legacy を import していないか」「byte-equal が新コーデックで成立するか」を**破壊的操作の前に**確認。失敗すれば削除を止める設計にした。
- **常時 green ゲート**: 各ステップで tsc 0 / 全テスト / build を通してから次へ。挙動不変リファクタは既存テストを安全網にした。
- **ロールバック点**: Group E 着手前に `git tag group-E-start`。

---

## 4. 残タスク・フォローアップ（完了時点の正直な棚卸し）

| 項目 | 種別 | 優先 | 状況 |
|---|---|---|---|
| ~~stale コメント5件（削除済み legacy パス参照）の整理~~ | 清掃 | 低 | 完了 (2026-07-14, `5cdb525f`) |
| ~~`css/index.css`（legacy `#wrapper` 用の可能性）の要否確認・除去~~ | 清掃 | 低 | 完了 (2026-07-14, `ff4154f2`。css/ 全撤去、debug クラスのみ styles/index.css へ保全) |
| ~~roadmap-v4 の LOC KPI（< 6,500）を実態に合わせ改訂~~ | ドキュメント | 中 | 完了 (2026-07-14。LOC は KPI から除外し構造条件のみ残す方針で改訂) |
| mobile PWA モード + 画面向き（net-new、未実装） | 新規機能 | 別途 | — |
| ~~センシティブモードのパスワードゲート + SHA 暗号化（フラグのみ実装）~~ | 新規機能 | 別途 | 完了 (実装済み) |
| UI 改善（実運用で「余地あり」との評価） | 改善 | 別途 | 継続 |
| リモートへの push | 運用 | — | 未 |

（mobile は「移行」ではなく「今後の新規実装」。完了判定の対象外。）

---

## 5. メトリクス

- **Group E 削除**: 37 ファイル、-8,360 行（view 11 / viewController 7 / viewModel 1 / model 6 / events 2 / interface 2 + Viewer.ts / index.ts + legacy utils 7）
- **完了時点**: src 79 ファイル 11,250 行 / tests 49 ファイル 10,603 行 / test 589 件 pass
- **依存**: 本番依存を 18 → 12、開発依存を 18 → 11 に削減

---

## 6. 参照

- 方針: [migration-roadmap-v4.md](migration-roadmap-v4.md)
- 途中反省文: [migration-postmortem.md](migration-postmortem.md)
- パリティ基準: [function-list.md](function-list.md) / [mode-spec.md](mode-spec.md) / [data-compatibility-spec.md](data-compatibility-spec.md)
