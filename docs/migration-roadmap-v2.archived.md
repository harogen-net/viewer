# 移行ロードマップ v2 (`da01238` 起点版)

> **歴史的記録**: 移行 v2 の計画書。当時の記述をそのまま残しており、**現状ではない**。
> ファイル名・用語は当時のもので、既に存在しないパスやモードの旧称を含む。
> 現在の構成は [function-list.md](function-list.md)、モード用語は [mode-spec.md](mode-spec.md) §1 を見ること。

> 作成日: 2026-06-19
> 起点コミット: `da01238438b14a3c24aeaf3ba29dd1ee7add7097` (2024-07-11)
> 旧ロードマップ ([migration-roadmap.md](migration-roadmap.md)) は 10 日 +118% で失敗。本書は反省文 ([migration-postmortem.md](migration-postmortem.md)) を踏まえ、**起点コミットからやり直す**前提で再設計。

---

## 0. 鉄則 (毎ターン守る、例外なし)

1. **置換は原子的**: 1 ファイル/1 機能を旧→新に置き換えるとき、**同一コミット内で旧コードを削除する**。新コードを先に書き、後で削除という運用は禁止。
2. **並走レイヤー禁止**: `bridge/` / `useCase/` / `adapter` 系の中間層を作らない。React FC は Zustand store を直接購読する。
3. **1 ターン 1 軸**: 1 ターンで複数の独立変更をしない。
4. **LOC 予算 ≤ 0**: 各ターンの src+tests 純差分を非正にする。新ライブラリ導入や regression test 追加など正増が必要なターンは事前に user 承認を取る。
5. **regression test を最初に整備**: byte-equal save/load test を P0 で物理整備し、以降のすべてのリファクタの安全網とする。
6. **抽出 = 削減ではない**: 抽出だけして元を縮めないターンは LOC 純増として扱う。

---

## 1. 起点と終点

### 起点 (`da01238`, 2024-07-11)

- **src+tests 合計**: **6,654 行** (テスト 0 行)
- **41 src ファイル**
- **18 ファイルが jQuery 利用**
- **innerHTML 直書き 0 件** (移行中に発生した 1 件は本起点には存在しない)
- **2 `createRoot()` 呼び出し** ※React 自体未導入なので 0 が正しい
- 主神クラス: `Viewer.ts` (333 行) / `EditableSlideView.ts` (692 行) / `SlideShowViewController.ts` (532 行) / `EditViewController.ts` (446 行) / `ListViewController.ts` (432 行) / `VMUI.ts` (479 行) / `SlideStorage.ts` (490 行)
- アーキテクチャ: jQuery + 自作 `EventDispatcher` + MVVM 風 (model / view / viewController / viewModel / utils)
- React / Zustand / Mantine: 未導入

### 終点 (目標)

- **src+tests 合計**: **< 6,500 行** (起点とほぼ同等。+regression test ぶん 100 行までは許容)
- React FC + Zustand + Mantine
- `EventDispatcher` / `PropertyEvent` / jQuery: **全て 0 件**
- god-class 全廃: `Viewer.ts` 削除、各 `*ViewController.ts` 削除、`EditableSlideView` を panel 群へ分解
- 単一 React root
- フォルダ: `components/` / `state/` / `model/` / `utils/` のみ (`view/` / `viewController/` / `viewModel/` / `interface/` 削除)

**目標は「縮減」ではなく「肥大化させずに React+Zustand 化」。** 起点が既に妥当な規模 (6,654 行) のため、リファクタで増やさないことが最優先。

---

## 2. Phase 配列 (実行順)

### P0. 安全網と土台 (推定 3〜5 ターン、許容 +200 行)

LOC 純増を許容する唯一の phase。

- [ ] `.png` / `.hvd` / `.hvz` 各 1 fixture を読み込み→保存→入力 byte-equal を assert する regression test を追加 (Node test runner)
- [ ] React 18 / Zustand 5 / Mantine 7 を `package.json` に追加
- [ ] `tsconfig.json` の jsx を `react-jsx` に変更
- [ ] AppShell の最小スケルトン (`<div id="root">` を消費する 1 root) を `index.ts` から呼び出す。中身は空。

**完了条件**: regression test pass + `npm run dev` で起動 + AppShell が画面に何も描画しない (placeholder 通過のみ)。

### P1. Zustand store の最小定義 (推定 2〜3 ターン、許容 +0 行 ※純増禁止)

`useCase/` や `bridge/` を作らず、Zustand store だけを定義する。

- [ ] `state/slideStore.ts` (slides / selectedIndex / actions)
- [ ] `state/layerStore.ts` (selectedLayer / actions)
- [ ] `state/viewerDocumentStore.ts` (document meta / save state)
- [ ] **store 以外の中間レイヤーを作らない**

**完了条件**: store 3 ファイルのみ存在。`bridge/` / `useCase/` / `hooks/` フォルダは作らない。

### P2. View 層の置換 (推定 8〜10 ターン、純差分 ≤ 0)

各 View クラスを **1 つずつ原子的に React FC に置換**する。複数並走させない。

順序 (依存末端から):

- [ ] `view/ProgressBar.ts` → `components/ProgressBar.tsx` (元削除と同一コミット)
- [ ] `view/layer/AdjustView.ts` → `components/AdjustView.tsx`
- [ ] `view/layer/ImageView.ts` → `components/ImageView.tsx`
- [ ] `view/layer/TextView.ts` → `components/TextView.tsx`
- [ ] `view/LayerView.ts` → `components/LayerView.tsx`
- [ ] `view/slide/CanvasSlideView.ts` → `components/CanvasSlideView.tsx`
- [ ] `view/slide/ThumbSlideView.ts` → `components/ThumbSlideView.tsx`
- [ ] `view/slide/DOMSlideView.ts` + `EditableSlideView.ts` → `components/SlideView.tsx` 単一 (mode prop で edit/display 切替)
- [ ] `view/SlideView.ts` (古い既存ファイル) → 新 `SlideView.tsx` に統合

**各ターンの不変条件**:
- 旧 `.ts` View クラスは同一コミットで削除する
- 新 `.tsx` は Zustand store を直接購読する (props は最小限)
- jQuery import は新ファイルに**ない**こと
- regression test pass

**完了条件**: `view/` フォルダ非存在。`components/SlideView.tsx` が edit/display を統合。

### P3. ViewController 層の置換 (推定 6〜8 ターン、純差分 ≤ 0)

ViewController は React FC + store action に解消される。

- [ ] `viewController/ProgressViewController.ts` → `components/ProgressBar.tsx` 内 effect に吸収 (削除)
- [ ] `viewController/file/FileSelector.ts` → `components/FileIOPanel.tsx`
- [ ] `viewController/edit/EditLayerListItem.ts` → `components/EditLayerListItem.tsx`
- [ ] `viewController/edit/EditLayerViewController.ts` → `components/LayerListPanel.tsx` (panel 自体)
- [ ] `viewController/EditViewController.ts` → `components/EditOpsPanel.tsx`
- [ ] `viewController/ListViewController.ts` → `components/SlideListPanel.tsx`
- [ ] `viewController/SlideShowViewController.ts` → `components/SlideshowShell.tsx`

**完了条件**: `viewController/` フォルダ非存在。

### P4. ViewModel 層の撤去 (推定 1〜2 ターン、純減 -480 行)

- [ ] `viewModel/VMUI.ts` (479 行) の責務を Zustand store action と AppShell の effect に吸収
- [ ] `viewModel/` / `interface/` フォルダ削除

**完了条件**: `viewModel/` / `interface/` フォルダ非存在。

### P5. EventDispatcher / PropertyEvent 撤去 (推定 2〜4 ターン、純減 -300 行)

P2〜P4 を**正しく**実行していれば、各 model が emit する PropertyEvent の listener はもう存在しないはず。残骸を物理的に消す。

- [ ] `Layer` / `Slide` / `ViewerDocument` から `addEventListener` / `removeEventListener` / `dispatchEvent` 呼び出しを撤去
- [ ] 通知が必要だった経路は store action 内 `set(...)` に統合
- [ ] `events/EventDispatcher.ts` 削除
- [ ] `events/PropertyEvent.ts` 削除
- [ ] `model/PropFlags.ts` が PropertyEvent 専用なら削除

**完了条件**: `grep -r "PropertyEvent\|EventDispatcher\|dispatchEvent" src/` が 0 件 (Web 標準の `dispatchEvent` を除く)。

### P6. Viewer god-class 撤去 (推定 2〜3 ターン、純減 -300 行)

P0 で AppShell を最小設置したので、ここに responsibility を集約する。

- [ ] `Viewer.ts` の責務を AppShell / 各 panel / store action に分配
- [ ] `index.ts` から `new Viewer(...)` を撤去、`createRoot(...).render(<AppShell />)` のみに
- [ ] `Viewer.ts` 削除

**完了条件**: `Viewer.ts` 非存在。`createRoot()` 呼び出しが index.ts の 1 箇所のみ。

### P7. 仕上げ (推定 2〜3 ターン、純減 -100 行)

- [ ] `utils/LayerViewFactory.ts` 削除 (jQuery 残骸 / React FC 化で不要)
- [ ] `utils/KeyboardManager.ts` を `useShellKeyboard.ts` 等の hook に解消
- [ ] CSS と Mantine の二重管理を Mantine に寄せる ([css/](../css/) 縮小)
- [ ] `any` 撤去
- [ ] デッドコード除去

**完了条件**: §3 KPI 全項目達成。

---

## 3. 完了条件 (KPI)

| 指標 | 起点 (`da01238`) | 目標 |
|---|---|---|
| src+tests 合計行数 | 6,654 | **< 6,500** (regression test +200 込みで起点と同等以下) |
| jQuery 利用ファイル | 18 | **0** |
| `EventDispatcher` / `PropertyEvent` 参照 | 数十 | **0** |
| `innerHTML` 直書き | 0 | **0** 維持 (起点で既に 0) |
| `Viewer.ts` god-class | 333 行 | **削除** |
| `viewController/` フォルダ | 7 ファイル | **削除** |
| `viewModel/` フォルダ | 1 ファイル | **削除** |
| `view/` フォルダ | 11 ファイル | **削除** (`components/` に統合) |
| `EditableSlideView` + `DOMSlideView` | 2 ファイル | **1 (`SlideView.tsx`)** |
| `createRoot()` 呼び出し数 | 0 (React 未導入) | **1** |
| `bridge/` フォルダ | 不在 | **作らない** |
| `useCase/` フォルダ | 不在 | **作らない** |
| `hooks/` フォルダ (専用) | 不在 | **不要 (store と FC で完結)** |
| regression test | 不在 | **byte-equal save/load fixture × 3** |

---

## 4. 1 ターンのテンプレート

```
1. ターン開始: git diff HEAD --stat で前ターン累積を確認
2. 着手 phase + サブタスク 1 つを宣言 (複数禁止)
3. 旧ファイル削除 → 新ファイル追加 を同一コミット内で
4. 検証: tsc --noEmit --skipLibCheck + regression test + 既存 test
5. ターン終了: git diff HEAD --stat の純差分を報告。+0 超なら user 承認を取る
```

---

## 5. 禁止事項 (失敗ロードマップから抽出)

- **新規抽象層の追加**: `bridge/` / `useCase/` / `*Adapter` / `*Factory` ファイルの作成
  - 唯一の例外: P0 で React/Zustand/Mantine を導入する `package.json` 編集
- **sub-ID の即興発明**: P*x.y* を実行中に作らない (旧 R3.7〜R3.13 / R4.6a〜d / R4.7.1〜.3 の轍を踏まない)
- **多軸同時変更**: 1 ターン 1 軸厳守
- **「あとで削除」と書いて温存**: 削除ゲート未達 = phase 未完
- **変数名・関数名の短縮による LOC 削減** (難読化扱い)
- **抽出だけで元を縮めないターン**: LOC 純増として扱う
- **置換中の並走**: 旧 View クラスが残っているうちに同責務の新 React FC を作らない (1 つずつ atomic に置換する)

---

## 6. ロールバック方針

各 phase 着手前に `git tag phase-Px-start`。phase 内で回帰が出たら**一括 reset → 別アプローチで再着手**。中途半端な並走をそのまま残すのは**過去最大の失敗**なので絶対にしない。

---

## 7. 推定総ターン数

合計 **26〜38 ターン**。

但し書き:

- 削除ゲート違反が起きた phase は再着工 +50%。
- byte-equal regression test の整備が想定外に難航する場合、P0 が伸びる。
- React/Zustand/Mantine 導入時のビルド設定 (vite.config.js / swa-cli.config.json) 修正が想定外に発生する可能性。
- 過去 10 日 +118% の実績は、執行者が**鉄則 §0 を物理的に守れるか**で成否が決まることを示す。鉄則 1 (置換の原子性) を守れない実装者は、ターン数が伸びるのではなく**目標達成自体ができない**。

---

## 8. 失敗ロードマップ (旧版) との本質的差分

| 観点 | 旧 v1 | 新 v2 |
|---|---|---|
| 起点想定 | 暗黙 | `da01238` (2024-07-11, 6,654 行) |
| 終点 LOC | 明記なし → 実績 +118% | < 6,500 (起点同等) |
| ライブラリ導入 | 段階的・並走前提 | P0 で一括導入、以降は置換のみ |
| 中間層 | `bridge/` / `useCase/` を新設 | **両方とも作らない** (鉄則 §0-2) |
| 置換単位 | ファイル単位で並走可 | **原子的置換** (旧削除と新追加を同一コミット) |
| sub-ID | 実行中に R3.7〜R3.13 等を即興発明 | sub-ID 即興禁止 |
| 安全網 | R0「回帰最小セット整備」と書きつつ未具体化 | byte-equal save/load test を P0 で物理整備 |
| 神コンポーネント分割 | 最後 (R5) | **発生させない** (P2/P3 で各 panel を最初から分けて作る) |
| ViewController 層 | 「Runtime クラス」として一旦残し、後で React 化 | 直接 React FC + store action へ置換 (1 ステップ) |
| ViewModel 層 | 移行後も残存 | P4 で削除 |

---

> 本書を読んでから執行する者へ:
>
> 鉄則 §0 の 6 項を「気合で守る」のではなく、ターン開始の `git diff HEAD --stat` 確認で**機械的に**守る。鉄則 1 (置換の原子性) と鉄則 2 (並走レイヤー禁止) が満たされていれば、過去 10 日の +118% パターンは構造的に再現しない。
