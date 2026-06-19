# 移行ロードマップ v3 (Strangler fig 版)

> 作成日: 2026-06-20
> 起点コミット: `c1936d80` (2026-06-20、v2 P0 / P1 / P2 サブ 1 完了状態)
> 旧 v2 ([migration-roadmap-v2.archived.md](migration-roadmap-v2.archived.md)) は §0-1 (ターン単位の置換原子性) が v2 §2 P2 step 8 (`EditableSlideView` 692 行 + 5 子 View の絡み合い) に対して構造的に成立せず停止。
> 本書は反省文 ([migration-postmortem.md](migration-postmortem.md)) **§1.1〜§1.6 / §2.1〜§2.6 / §3 を全項目厳密遵守**する形で再設計。

---

## 0. 方針転換の理由

v2 §0-1「1 ターン内で旧削除と新追加を同一コミット」は神 component に対して物理的に成立しない。これは postmortem §2.5「神 component 分割を最後に回すべきではなかった」が指摘した構造問題そのもの。

v3 では **原子性の粒度をターン単位から component 単位に切り替える** (Strangler fig パターン):

- 各 component は **build フェーズ (1〜5 ターン) → swap コミット (1 ターン)** の寿命を持つ
- build フェーズ中はレガシーと新コードが並走する (= v2 §0-1 を意図的に解除)
- swap コミットで対応レガシーを物理削除 (= postmortem §3「削除ゲート」)
- **build 開始から swap までの上限を 5 ターンに固定**。超過したら `git reset --hard component-N-start` で巻戻し

これにより postmortem §1.1 が断罪した「並走を作ったまま放置」は、**削除ゲートの機械化**によって構造的に不可能になる。

---

## 1. 起点と終点

### 起点 (`c1936d80`, 2026-06-20)

- src 合計: ~6,800 行 (`Viewer.ts` 332 / `viewModel/VMUI.ts` 479 / `view/` 1,698 / `viewController/` 1,761 / `utils/` 1,274 / `model/` 944 / `events/` 105 / `state/` 77 / `types/` 77 / `components/` 17 / `interface/` 6)
- tests: 85 行 (storage round-trip × 3 fixture: HVD / HVZ / PNG)
- React 18 / Zustand 5 / Mantine 7 導入済、`tsconfig.json` jsx=react-jsx 済
- zustand store 3 つ (`state/slideStore.ts` `state/layerStore.ts` `state/viewerDocumentStore.ts`) + 純粋 type 3 つ (`types/`) 実装済
- v2 P2 サブ 1 (`view/ProgressBar.ts` → `components/ProgressBar.tsx`) は v2 §0-1 を満たした唯一のコミット `5df6839a` で原子置換済

### 終点 (KPI、v2 から継承)

| 指標 | 起点 | 目標 |
|---|---|---|
| src+tests 合計行数 | ~6,881 | **< 6,500** |
| jQuery 利用ファイル | 4 (`index.ts` / `Viewer.ts` / `view/slide/EditableSlideView.ts` / `utils/LayerViewFactory.ts`) | **0** |
| `EventDispatcher` / `PropertyEvent` 参照 | 数十 | **0** |
| `innerHTML` 直書き | 0 (起点維持) | **0** 維持 |
| `Viewer.ts` god-class | 332 行 | **削除** |
| `viewController/` フォルダ | 7 ファイル | **削除** |
| `viewModel/` フォルダ | 1 ファイル | **削除** |
| `view/` フォルダ | 11 ファイル | **削除** |
| `EditableSlideView` + `DOMSlideView` + `ThumbSlideView` + `CanvasSlideView` + `SlideView` | 5 ファイル | **1 (`components/slide/SlideView.tsx` mode prop)** |
| `createRoot()` 呼び出し数 | 0 | **1 (`index.ts` のみ)** |
| `bridge/` `useCase/` `runtime/` `react/` `*Adapter` `*Manager` フォルダ・命名 | 不在 | **作らない** |
| regression test | HVD/HVZ/PNG 各 1 | **+ 各新 component の round-trip / 主要操作 test** |

---

## 2. 鉄則 (毎ターン守る、反省文の機械化)

### §0-1. component 単位の原子性 (反省文 §1.1, §3「削除ゲート」)

各 component は build (1〜5 ターン) + swap (1 ターン) の固定寿命。**build 開始から 5 ターン以内に swap が完了しなければ build を `git reset --hard` で巻戻し、component 設計を見直す**。並走の慢性化を物理禁止。

### §0-2. 中間層・新規抽象層禁止 (反省文 §2.4, §1.5)

新側で以下のフォルダ・命名は作らない: `bridge/` `useCase/` `runtime/` `react/` `*Adapter` `*Manager` `*Factory` (※既存 `utils/LayerViewFactory.ts` は §3 catalog #13 で削除対象)。
最終フォルダ構成は **`components/` `hooks/` `state/` `types/` `utils/` `events/` (撤去まで暫定) のみ**。`hooks/` は zustand selector を束ねる薄い hook 専用。FC は store を直接購読する。

### §0-3. レガシー編集禁止 (反省文 §1.1 再発防止、新規)

build ターン中は以下を**読み取り専用**: `src/view/` `src/viewController/` `src/viewModel/` `src/Viewer.ts` `src/index.ts` `src/utils/LayerViewFactory.ts` `src/utils/KeyboardManager.ts` `src/events/` `src/model/` `src/interface/`。仕様参照のみ。
**例外**: swap コミットでは対応レガシーファイル削除 + 他レガシーからの import 文除去のみ許可 (動作ロジックの変更は禁止)。

### §0-4. 1 ターン 1 軸 (反省文 §1.3)

build ターンは「1 component の build 1 ステップ」のみ。swap ターンは「1 component の swap」のみ。build と swap を同一ターンで実施しない。

### §0-5. LOC 帳簿 (反省文 §1.6 の機械化)

毎ターン末に以下を報告:

```
build ターン: legacy ±0, new +N, total +N (LOC 負債として計上)
swap ターン:  legacy -M, new ±α, total -(M-α) (負債回収)
```

**§3 catalog の各 component 群 (#2-#4, #5, #6-#11, #12-#15) の最終 swap 完了時点で累積 total が単調減少していること**。最終終点で < 6,500 行。

### §0-6. component 単独 round-trip test 同梱 (反省文 §2.6)

各 component の swap コミットには `tests/fixtures/` の HVD/HVZ/PNG を**新 component 経由で**処理する round-trip テストを**同一コミット**で追加。test なしの swap は phase 未完。

### §0-7. 抽出のみのターン禁止 (反省文 §1.2)

新コードを「後で使うかも」と先んじて helper に切り出さない。1 関数 1 ファイル禁止 (反省文 §1.4)。新ファイルは最低 30 行・複数の関連責務を持つこと。

### §0-8. dual entrypoint (Strangler fig の機械化、新規)

- `src/index.ts` (現行、レガシー): `new Viewer(...)` でレガシーをマウント (修正禁止 §0-3)
- `src/main-new.tsx` (P0-A で新規追加): `?new=1` クエリ時のみ `createRoot(<AppShell />)` でレガシーを bypass
- 両者は同一 zustand store を共有 (新側でロード/保存テストが実行可能)
- swap コミットで対応レガシー削除 → レガシー側で当該 component を使う機能は部分的に壊れる前提
- 最終 swap コミット (#14) で `src/index.ts` を削除し `src/main-new.tsx` を `src/main.tsx` にリネーム、createRoot を 1 個に

### §0-9. parity 方針 = b (HVD 厳密 / UI 仕様書ベース)

- **HVD/HVZ/PNG 永続化形式は byte-equal 厳密** (memory 行 32-33 規約遵守、postmortem §2.6)
- **UI 操作は仕様書ベース**: [docs/function-list.md](function-list.md) / [docs/mode-spec.md](mode-spec.md) / [docs/sensitive-mode-spec.md](sensitive-mode-spec.md) / [docs/data-compatibility-spec.md](data-compatibility-spec.md) に明記された挙動を再現。pixel-perfect (cursor 形状の細部等) は不問
- 「機能だけある程度」を口実にした仕様逸脱は禁止。仕様書記載の挙動は必須

---

## 3. component カタログ (build 順、サブ ID 即興発明禁止)

依存末端から積み上げる。**以下の表 1 行 = 1 component build 単位**。サブ ID (#2a, #2.1 等) を agent が build 中に発明することは禁止 (memory 行 16, 18 / 反省文 §3)。

| # | レガシー (削除対象) | 新 (build 先) | build 上限 | swap 前提条件 |
|---|---|---|---|---|
| 1 | (済) `view/ProgressBar.ts` | (済) `components/ProgressBar.tsx` | (済) | (済 `5df6839a`) |
| 2 | `view/layer/AdjustView.ts` (※) | `components/layer/AdjustView.tsx` | 2 | レガシー側の `LayerView.ts` がまだ参照 → swap は #4 と同時 |
| 3 | `view/layer/ImageView.ts` + `view/layer/TextView.ts` | `components/layer/LayerContent.tsx` (`type: "image" \| "text"` discriminated union) | 3 | swap は #4 と同時 (レガシー `LayerView.ts` 経由参照) |
| 4 | `view/LayerView.ts` | `components/layer/LayerView.tsx` | 3 | #2, #3 の build 完了。swap は #2 + #3 + #4 を**同一コミット**で一括 (レガシー `EditableSlideView.ts` の `addLayerView` 経路除去含む) |
| 5 | `view/slide/CanvasSlideView.ts` + `view/slide/DOMSlideView.ts` + `view/slide/EditableSlideView.ts` + `view/slide/ThumbSlideView.ts` + `view/SlideView.ts` | `components/slide/SlideView.tsx` (`mode: "canvas" \| "edit" \| "thumb"` 単一 FC、反省文 §2.3) | 5 | #4 swap 完了。swap は 5 ファイル一括削除 (jQuery 1 ファイル除去) |
| 6 | `viewController/ProgressViewController.ts` | `components/ProgressBar.tsx` の `useEffect` に吸収 | 1 | 単独 swap 可 (レガシー `Viewer.ts` の import 文除去) |
| 7 | `viewController/file/FileSelector.ts` | `components/panels/FileIOPanel.tsx` | 2 | 単独 swap 可 |
| 8 | `viewController/edit/EditLayerListItem.ts` + `viewController/edit/EditLayerViewController.ts` | `components/panels/LayerListPanel.tsx` | 3 | #5 swap 完了 |
| 9 | `viewController/EditViewController.ts` | `components/panels/EditOpsPanel.tsx` | 3 | #5, #8 swap 完了 |
| 10 | `viewController/ListViewController.ts` | `components/panels/SlideListPanel.tsx` | 3 | #5 swap 完了 |
| 11 | `viewController/SlideShowViewController.ts` | `components/SlideshowShell.tsx` | 3 | #5 swap 完了 |
| 12 | `viewModel/VMUI.ts` (479 行) | store action + AppShell の `useEffect` に分配吸収 | 2 | #6-#11 swap 完了 |
| 13 | `utils/LayerViewFactory.ts` + `utils/KeyboardManager.ts` | 廃止 / `hooks/useShellKeyboard.ts` 等に解消 | 2 | #5 swap 完了 |
| 14 | `Viewer.ts` (332 行) + 現行 `index.ts` (jQuery) | `index.ts` を `createRoot(<AppShell />)` のみに置換 + `main-new.tsx` を `main.tsx` に統合 | 1 | #1-#13 swap 完了 |
| 15 | `events/EventDispatcher.ts` + `events/PropertyEvent.ts` + `model/PropFlags.ts` + `model/Layer.ts` + `model/layer/*.ts` + `model/Slide.ts` + `model/ViewerDocument.ts` + `interface/IDroppable.ts` + `interface/IVMUI.ts` | 全削除 (新側は `types/` 純粋型のみ使用、反省文 §2.1) | 1 | #14 swap 完了 |

(※) `AdjustView` は selection 矩形+ハンドル UI。レガシー `EditableSlideView` が `mousedown` で `.adjustView.startDrag(e)` 呼出。新側は store の `layerStore.selectedLayerId` を購読して FC として宣言的に描画。

### 各 component の build 完了条件 (反省文 §3 「完了条件を最初に固定」)

build 完了 = 以下 4 つすべて満たす:

1. **機能 parity** (§0-9 方針 b): HVD/HVZ/PNG round-trip が新 component 経由で byte-equal pass + 仕様書記載の主要 UI 操作が動作
2. **`?new=1` で手動動作確認** (`npm run dev` → ブラウザで確認)
3. **新 component の単独 vitest 追加** (round-trip + 主要操作の store 反映)
4. **TypeScript エラー 0** (`tsc --noEmit --skipLibCheck`)

上記 4 つを満たしてから swap コミットに着工。

---

## 4. ターンテンプレート

### build ターン

```
1. ターン開始: git diff HEAD --stat で前ターン累積を確認
   + 現在 build 中の component の build 開始からの経過ターン数を確認 (§0-1 5 ターン上限)
2. 着手 component (#N) + 今回の build step 1 つを宣言 (複数禁止 §0-4)
3. 新ファイル追加・編集のみ (レガシー一切触らない §0-3)
4. 検証: tsc --noEmit --skipLibCheck + 既存全 test pass
5. ターン末: legacy 0 / new +N / total +N (LOC 負債計上 §0-5) を報告
6. todoList 更新 (build 経過ターン明示)
```

### swap ターン

```
1. ターン開始: build 完了条件 4 つの達成を再確認
2. swap 対象 component (#N or 群 #N-#M) を宣言
3. 同一コミット内で:
   a) レガシーファイル rm
   b) 他レガシー側の当該 import 文除去 (動作ロジック変更は禁止 §0-3 例外)
   c) 新 component の round-trip test 追加 (§0-6)
   d) 必要なら AppShell に新 component を組込
4. 検証: tsc --noEmit --skipLibCheck + 全 test pass + ?new=1 動作確認
5. ターン末: legacy -M / new +α / total -(M-α) を報告 (§0-5)
6. todoList の component を completed にマーク
```

---

## 5. 禁止事項 (反省文 §1.1〜§1.6 機械化、v2 §5 継承)

- **swap までの 5 ターン上限超過放置** (§0-1 違反、反省文 §1.1)
- **新規抽象層作成**: `bridge/` `useCase/` `*Adapter` `*Manager` フォルダ。1 関数 1 ファイル (§0-2、反省文 §1.4)
- **sub-ID 即興発明**: `#5.1` `#5.2a` 等を build 中に作らない (memory 行 16, 18 / 反省文 §3)
- **多軸同時変更** (§0-4、反省文 §1.3)
- **build ターン中のレガシー編集** (§0-3 違反)
- **swap コミットでのレガシー動作ロジック変更** (§0-3 例外を逸脱)
- **抽出のみのターン**: 削減を伴わない切り出し (§0-7、反省文 §1.2)
- **fixture round-trip test なしの swap** (§0-6 違反)
- **「機能だけある程度」を口実にした仕様逸脱** (§0-9 違反): 仕様書記載の挙動は必須
- **roadmap 構造の改変**: 本書のテーブル・catalog ID 体系を agent が編集 (memory 行 16, ユーザ明示)
- **KPI 緩和の独断**: byte-equal を構造比較に独断緩和、fixture 数の妥協など (memory 行 21、ユーザ承認必須)

---

## 6. ロールバック方針

- 各 component の build 開始時に `git tag component-N-start`
- build フェーズで回帰または LOC 過大増 (single build ターンで +500 行超等) → 一括 `git reset --hard component-N-start` → 別アプローチで再着手
- swap コミット失敗 → `git reset --hard HEAD~1` → build 続行
- §0-1 (5 ターン上限) 超過 = 自動巻戻しトリガ。例外承認は user のみ

---

## 7. 推定ターン数

| catalog # | build ターン | swap ターン | 累計 |
|---|---|---|---|
| #1 (済) | 0 | 0 | 0 |
| #2 + #3 + #4 (一括 swap) | 2+3+3 = 8 | 1 | 9 |
| #5 | 5 | 1 | 15 |
| #6 | 1 | 1 | 17 |
| #7 | 2 | 1 | 20 |
| #8 | 3 | 1 | 24 |
| #9 | 3 | 1 | 28 |
| #10 | 3 | 1 | 32 |
| #11 | 3 | 1 | 36 |
| #12 | 2 | 1 | 39 |
| #13 | 2 | 1 | 42 |
| #14 | 1 | 1 | 44 |
| #15 | 1 | 1 | 46 |

合計 **約 46 ターン**。

但し書き:
- 反省文 §3 末尾の「8〜15 ターン規模」推定は v2 §0-1 (ターン原子性) 前提のため適用不可
- Strangler fig 採用で並走期間が必然的に発生 → ターン数は v2 推定 (26-38) より多い
- ターン数の絶対値より「LOC 帳簿の累積 total が swap 群完了ごとに単調減少していること」が成否指標
- §0-1 (5 ターン上限) を守れる実装者なら 46 ターン規模で完遂、守れない実装者は build 巻戻しでさらに伸びる

---

## 8. v2 との差分

| 観点 | v2 (archived) | v3 |
|---|---|---|
| 原子性の粒度 | ターン単位 (§0-1) | **component 単位** (build 1-5 ターン + swap 1 ターン) |
| 神 component 対策 | 「最後の `SlideView` 1 ターンで原子化」(成立せず) | mode prop 単一 FC で再構築、5 ターン build、最後に 5 ファイル一括 swap (#5) |
| dual entrypoint | なし (レガシー直接置換) | `src/main-new.tsx` + `?new=1`、最終 swap (#14) で統合 |
| build 中のレガシー編集 | 暗黙に許容 | 明示禁止 (§0-3)、swap コミット内の import 文除去のみ例外 |
| swap 期限 | なし | **5 ターン上限**、超過で `git reset` (§0-1) |
| 各 component test | 統一 regression 1 個 | round-trip + 主要操作 test を各 swap 同梱 (§0-6) |
| 起点 | `da01238` (2024-07-11、6,654 行) | `c1936d80` (2026-06-20、v2 で完了した P0-P1 + ProgressBar swap から接続) |
| sub-ID | `P0.1a` 等の即興発明で混乱 (memory 行 30) | catalog #N 固定、サブ ID 発明禁止 |

---

> 執行者へ:
>
> v3 は反省文 §1.1〜§1.6 + §2.1〜§2.6 + §3 を**全項目機械化**することで、「並走を作ったまま放置」を**構造的に不可能**にした版である。
>
> 鉄則 §0-1 (component 単位原子性 + 5 ターン上限) と §0-3 (レガシー編集禁止) が満たされていれば、postmortem §1.1 の +118% パターンは構造的に再現しない。
>
> v2 が「ターン原子性」で破綻したように、v3 が破綻するとすれば「§0-1 の 5 ターン上限の運用緩み」である。1 component が 5 ターンで build できないと判明した時点で、その component 設計は誤り。`git reset` して再設計する。
