# 移行ロードマップ v3 (Strangler fig 版)

> 作成日: 2026-06-20
> 起点コミット: `c1936d80` (2026-06-20、v2 P0 / P1 / P2 サブ 1 完了状態)
> 旧 v2 ([migration-roadmap-v2.archived.md](migration-roadmap-v2.archived.md)) は §0-1 (ターン単位の置換原子性) が v2 §2 P2 step 8 (`EditableSlideView` 692 行 + 5 子 View の絡み合い) に対して構造的に成立せず停止。
> 本書は反省文 ([migration-postmortem.md](migration-postmortem.md)) **§1.1〜§1.6 / §2.1〜§2.6 / §3 を全項目厳密遵守**する形で再設計。

---

## 0. 方針転換の理由

v2 §0-1「1 ターン内で旧削除と新追加を同一コミット」は神 component に対して物理的に成立しない。これは postmortem §2.5「神 component 分割を最後に回すべきではなかった」が指摘した構造問題そのもの。

v3 では 2 つの転換を同時に行う:

**転換 1: 原子性の粒度をターン単位から swap chunk 単位に切り替える** (Strangler fig パターン):

- 各 swap chunk は **build フェーズ (1、5 ターン) → swap コミット (1 ターン)** の寿命を持つ
- build フェーズ中はレガシーと新コードが並走する (= v2 §0-1 を意図的に解除)
- swap コミットで対応レガシーを物理削除 (= postmortem §3「削除ゲート」)
- **build 開始から swap までの上限を 5 ターンに固定**。超過したら `git reset --hard chunk-N-start` で巻戻し

**転換 2: 「依存末端から」(bottom-up) を「機能的に切り離せる縦スライスから」(vertical slice) に切り替える**:

- 依存末端 (`AdjustView` 等) は唯一の consumer が神 component のため、末端だけを先に切り出しても本体レガシーがその末端を依然として使う → どうせ swap できず並走が長期化する
- **機能的に独立したスライス (SlideShow / ViewerDocumentIO / SlideList / Edit) を単位**とし、そのスライスの viewController を完成後に削除する
- 共有される view class (`SlideView` base 等) は Group D (Edit) までレガシーとして生き残るが、それは「並走」ではなく「レガシー側の未移行部分の依存」。新側は一切使わずに `?new=1` で独立動作する

これにより postmortem §1.1 が断罪した「並走を作ったまま放置」は、**削除ゲートの機械化 + 独立スライスごとの収束**によって構造的に不可能になる。

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

### §0-1. swap chunk 単位の原子性 (反省文 §1.1, §3「削除ゲート」)

各 swap chunk は build (1、5 ターン) + swap (1 ターン) の固定寿命。**build 開始から 5 ターン以内に swap が完了しなければ build を `git reset --hard chunk-X-start` で巻戻し、chunk 設計を見直す**。並走の慢性化を物理禁止。

chunk は Group (A/B/C/D) 内部で複数設けてよい (例: A.単位規模が大きい場合は `SlideshowShell skeleton` と `slideshow controls` の 2 chunk に分ける)。ただし chunk 分割は **その Group 着手時点で todoList に明示宣言する**。Group 着手後に chunk を增やすのはサブ ID 即興発明 (memory 行 16) に該当し禁止。

### §0-2. 中間層・新規抽象層禁止 (反省文 §2.4, §1.5)

新側で以下のフォルダ・命名は作らない: `bridge/` `useCase/` `runtime/` `react/` `*Adapter` `*Manager` `*Factory` (※既存 `utils/LayerViewFactory.ts` は Group D で削除対象)。
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

**§3 の各 Group (A / B / C / D) の最終 swap 完了時点で累計 total が単調減少していること**。最終終点で < 6,500 行。

### §0-6. component 単独 round-trip test 同梱 (反省文 §2.6)

各 component の swap コミットには `tests/fixtures/` の HVD/HVZ/PNG を**新 component 経由で**処理する round-trip テストを**同一コミット**で追加。test なしの swap は phase 未完。

### §0-7. 抽出のみのターン禁止 (反省文 §1.2)

新コードを「後で使うかも」と先んじて helper に切り出さない。1 関数 1 ファイル禁止 (反省文 §1.4)。新ファイルは最低 30 行・複数の関連責務を持つこと。

### §0-8. dual entrypoint (Strangler fig の機械化、新規)

- `src/index.ts` (現行、レガシー): `new Viewer(...)` でレガシーをマウント (修正禁止 §0-3)
- `src/main-new.tsx` (P0-A で新規追加): `?new=1` クエリ時のみ `createRoot(<AppShell />)` でレガシーを bypass
- 両者は同一 zustand store を共有 (新側でロード/保存テストが実行可能)
- swap コミットで対応レガシー削除 → レガシー側で当該 component を使う機能は部分的に壊れる前提
- 最終 swap コミット (Group D 末尾) で `src/index.ts` を削除し `src/main-new.tsx` を `src/main.tsx` にリネーム、createRoot を 1 個に

### §0-9. parity 方針 = b (HVD 厳密 / UI 仕様書ベース)

- **HVD/HVZ/PNG 永続化形式は byte-equal 厳密** (memory 行 32-33 規約遵守、postmortem §2.6)
- **UI 操作は仕様書ベース**: [docs/function-list.md](function-list.md) / [docs/mode-spec.md](mode-spec.md) / [docs/sensitive-mode-spec.md](sensitive-mode-spec.md) / [docs/data-compatibility-spec.md](data-compatibility-spec.md) に明記された挙動を再現。pixel-perfect (cursor 形状の細部等) は不問
- 「機能だけある程度」を口実にした仕様逸脱は禁止。仕様書記載の挙動は必須

---

## 3. Group カタログ (vertical slice 順、Group ID 固定)

機能的に切り離せる縦スライスから着手する (ユーザ指示 2026-06-20)。**以下表の Group ID (A/B/C/D) は固定**。Group 内の chunk 分割は Group 着手時に todoList で宣言する (§0-1)。サブ ID を agent が build 中に発明することは禁止 (memory 行 16, 18 / 反省文 §3)。

### Group A. SlideShow (最も独立性が高い)

スライドショーは全画面表示の読み取り専用モード。編集状態と独立。

| swap chunk | レガシー (削除対象) | 新 (build 先) | build 上限 |
|---|---|---|---|
| A | `viewController/SlideShowViewController.ts` (~530 行 jQuery) + `Viewer.ts` の slideshow 関連メソッド surgery | `components/SlideshowShell.tsx` (全画面シェル + Mantine Modal) + `components/slide/SlideView.tsx` (初版 = 読み取り専用描画コア、`mode` prop 未追加) + 必要な `hooks/` (auto-advance タイマー等) | 5 |

レガシー `DOMSlideView` `SlideView` (base) は Edit が依存するため Group D まで生き残る。新 `components/slide/SlideView.tsx` はそれとは独立の新実装。

build 動作確認代替案 (§0-8): 新側 AppShell に dev-only fixture ローダ (`?new=1&fixture=2026-06-16_170948.hvd`) を一時的に設置。Group B 完了時に削除。

### Group B. ViewerDocumentIO

ドキュメントレベルのロード/セーブ/インポート/エクスポート + 画像ライブラリ。

| swap chunk | レガシー (削除対象) | 新 (build 先) | build 上限 |
|---|---|---|---|
| B | `viewController/file/FileSelector.ts` + `Viewer.ts` のファイル IO メソッド surgery + Group A の dev-only fixture ローダ削除 | `components/panels/FileIOPanel.tsx` + load/save/import/export を store action 化 + Mantine ダイアログ | 5 |

依然 `Viewer.ts` 本体は Edit 関連メソッドが残るため Group D まで存続 (サイズだけ縮む)。

### Group C. SlideList

スライドサムネイル一覧 + 進捗表示 + 並び替え。

| swap chunk | レガシー (削除対象) | 新 (build 先) | build 上限 |
|---|---|---|---|
| C | `viewController/ListViewController.ts` (~432 行) + `viewController/ProgressViewController.ts` + `view/slide/ThumbSlideView.ts` + `view/slide/CanvasSlideView.ts` (Thumb の唯一の派生先、他消費者なしを swap 時に確認) | `components/panels/SlideListPanel.tsx` (並び替え含む) + `components/slide/SlideView.tsx` に `mode="thumb"` 拡張 + `components/ProgressBar.tsx` の useEffect で進捗表示吸収 | 5 |

### Group D. Edit (最も冗長で神 component を含む)

編集画面、レイヤー操作、ドラッグ/ドロップ、キーボード、コマンド履歴。サイズ上 Group 内で複数 chunk に分割し、順次 swap する。**詳細 chunk 分割は Group D 着手時に todoList で宣言**する (Group A/B/C で学んだ値を反映させるため事前詳細設計はしない)。Group D 全体の限界は **累計 30 ターン以内**。

最終的に削除されるレガシー:

- `viewController/EditViewController.ts` (~446 行) + `viewController/edit/EditLayerListItem.ts` + `viewController/edit/EditLayerViewController.ts`
- `viewModel/VMUI.ts` (479 行)
- `view/slide/EditableSlideView.ts` (692 行 jQuery) + `view/slide/DOMSlideView.ts` + `view/SlideView.ts` (base)
- `view/LayerView.ts` (base) + `view/layer/AdjustView.ts` + `view/layer/ImageView.ts` + `view/layer/TextView.ts`
- `utils/LayerViewFactory.ts` + `utils/KeyboardManager.ts`
- `Viewer.ts` (残り全て、~332 行) + 現行 `index.ts` (jQuery)
- `events/EventDispatcher.ts` + `events/PropertyEvent.ts` + `model/PropFlags.ts` + `model/Layer.ts` + `model/layer/*.ts` + `model/Slide.ts` + `model/ViewerDocument.ts` + `interface/IDroppable.ts` + `interface/IVMUI.ts`

最終的に追加される新コード:

- `components/panels/LayerListPanel.tsx` + `components/panels/EditOpsPanel.tsx`
- `components/slide/SlideView.tsx` に `mode="edit"` 拡張 (ハンドル/ドラッグ/レイヤー選択 UI)
- `components/layer/LayerView.tsx` + `components/layer/LayerContent.tsx` (image/text discriminated union) + `components/layer/AdjustView.tsx`
- `hooks/useShellKeyboard.ts` 等
- `index.ts` を `createRoot(<AppShell />)` の 1 行に置換 + `main-new.tsx` を `main.tsx` にリネームし統合

Group D 内完了時に createRoot 1 個 / jQuery 0 / EventDispatcher 0 / view+viewController+viewModel フォルダ取り類 §1 KPI を達成。

### 各 chunk の build 完了条件 (反省文 §3 「完了条件を最初に固定」)

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
   + 現在 build 中の chunk (Group + chunk 名) の build 開始からの経過ターン数を確認 (§0-1 5 ターン上限)
2. 着手 chunk + 今回の build step 1 つを宣言 (複数禁止 §0-4)
3. 新ファイル追加・編集のみ (レガシー一切触らない §0-3)
4. 検証: tsc --noEmit --skipLibCheck + 既存全 test pass
5. ターン末: legacy 0 / new +N / total +N (LOC 負債計上 §0-5) を報告
6. todoList 更新 (build 経過ターン明示)
```

### swap ターン

```
1. ターン開始: build 完了条件 4 つの達成を再確認
2. swap 対象 chunk を宣言
3. 同一コミット内で:
   a) レガシーファイル rm
   b) 他レガシー側の当該 import 文除去 (動作ロジック変更は禁止 §0-3 例外)
   c) 新 component の round-trip test 追加 (§0-6)
   d) 必要なら AppShell に新 component を組込
4. 検証: tsc --noEmit --skipLibCheck + 全 test pass + ?new=1 動作確認
5. ターン末: legacy -M / new +α / total -(M-α) を報告 (§0-5)
6. todoList の chunk を completed にマーク
```

---

## 5. 禁止事項 (反省文 §1.1〜§1.6 機械化、v2 §5 継承)

- **swap までの 5 ターン上限超過放置** (§0-1 違反、反省文 §1.1)
- **新規抽象層作成**: `bridge/` `useCase/` `*Adapter` `*Manager` フォルダ。1 関数 1 ファイル (§0-2、反省文 §1.4)
- **sub-ID 即興発明**: `D.1` `D.2a` 等を Group 着手時以外 (= build 中) に作らない (memory 行 16, 18 / 反省文 §3)。Group ID (A/B/C/D) は§3 で固定、Group 内 chunk 名は Group 着手時の todoList 宣言で固定
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

- 各 chunk の build 開始時に `git tag chunk-X-start` (X = `A`, `B`, `C`, `D.1` 等、Group 着手時に todoList で宣言した chunk 名)
- build フェーズで回帰または LOC 過大増 (single build ターンで +500 行超等) → 一括 `git reset --hard chunk-X-start` → 別アプローチで再着手
- swap コミット失敗 → `git reset --hard HEAD~1` → build 続行
- §0-1 (5 ターン上限) 超過 = 自動巻戻しトリガ。例外承認は user のみ

---

## 7. 推定ターン数

| Group | build ターン | swap ターン | 小計 | 累計 |
|---|---|---|---|---|
| (済) #1 ProgressBar | 0 | 0 | 0 | 0 |
| A. SlideShow | 3-5 | 1 | 4-6 | 4-6 |
| B. ViewerDocumentIO | 3-5 | 1 | 4-6 | 8-12 |
| C. SlideList | 3-5 | 1 | 4-6 | 12-18 |
| D. Edit (複数 chunk) | 20-25 | 5-8 | 25-33 | 37-51 |

合計 **約 37〜51 ターン**。

但し書き:
- 反省文 §3 末尾の「8〜15 ターン規模」推定は v2 §0-1 (ターン原子性) 前提のため適用不可
- Strangler fig + vertical slice 採用で並走期間が必然的に発生 → ターン数は v2 推定 (26-38) より多め
- ターン数の絶対値より「LOC 帳簿の累積 total が Group 完了ごとに単調減少していること」が成否指標
- §0-1 (5 ターン上限) を守れる実装者なら 51 ターン以下で完遂、守れない実装者は build 巻戻しでさらに伸びる
- Group A を最初に選んだ理由: SlideShow は独立状態を持たず読み取り専用モード、全画面表示、Edit 状態と交わらないため、vertical slice として最も小さく独立している。ここで「新側 component 設計パターン」(store 購読 / vitest 型 / Mantine コンポーネント選定 / FC 構造) を確立し B/C/D に適用する

---

## 8. v2 との差分

| 観点 | v2 (archived) | v3 |
|---|---|---|
| 原子性の粒度 | ターン単位 (§0-1) | **swap chunk 単位** (build 1-5 ターン + swap 1 ターン) |
| 分割原理 | 依存末端から (bottom-up、`ProgressBar → AdjustView → ImageView → ...`) | **機能的に切り離せる縦スライスから** (vertical slice、`SlideShow → IO → List → Edit`) |
| 神 component 対策 | 「最後の `SlideView` 1 ターンで原子化」(成立せず) | Group A で読み取り専用 SlideView を先にシンプルに作り、Group D で mode="edit" を段階拡張。神 component (Edit) は最後だが、それまでに 3 Group でパターンを確立 |
| dual entrypoint | なし (レガシー直接置換) | `src/main-new.tsx` + `?new=1`、最終 swap (Group D 末尾) で統合 |
| build 中のレガシー編集 | 暗黙に許容 | 明示禁止 (§0-3)、swap コミット内の import 文除去のみ例外 |
| swap 期限 | なし | **5 ターン上限**、超過で `git reset` (§0-1) |
| 各 chunk test | 統一 regression 1 個 | round-trip + 主要操作 test を各 swap 同梱 (§0-6) |
| 起点 | `da01238` (2024-07-11、6,654 行) | `c1936d80` (2026-06-20、v2 で完了した P0-P1 + ProgressBar swap から接続) |
| sub-ID | `P0.1a` 等の即興発明で混乱 (memory 行 30) | Group ID (A/B/C/D) 固定、Group 内 chunk は着手時に todoList で宣言 |

---

> 執行者へ:
>
> v3 は反省文 §1.1〜§1.6 + §2.1〜§2.6 + §3 を**全項目機械化**することに加え、vertical slice (SlideShow → IO → List → Edit) で機能的に独立した単位から着手することで、「並走を作ったまま放置」を**構造的に不可能**にした版である。
>
> 鉄則 §0-1 (swap chunk 単位原子性 + 5 ターン上限) と §0-3 (レガシー編集禁止) が満たされていれば、postmortem §1.1 の +118% パターンは構造的に再現しない。
>
> v2 が「ターン原子性」で破綻し、bottom-up 順序 (`ProgressBar → AdjustView → ...`) が「神 component が唯一の consumer」問題で破綻したように、v3 が破綻するとすれば「§0-1 の 5 ターン上限の運用緩み」または「Group 内 chunk 即興発明」である。1 chunk が 5 ターンで build できないと判明した時点で、その chunk 設計は誤り。`git reset` して再設計する。
