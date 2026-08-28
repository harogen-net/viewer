# モード仕様書（PCモード / スマホモード / 一覧モード / 編集モード）

## 目的

本書は、起動モード判定とモード別機能制御を定義する。
対象は React 移行後の単一エントリ実装（同一 HTML）を前提とする。

## 関連ドキュメント

- docs/function-list.md
- docs/migration-roadmap.md

## 実装状況（2026-08-28 現在）

用語は §1 を参照。ここに挙げるファイルは実在するものだけ。

- 実装済み
  - 起動モード解決（URL クエリ + スマホ環境判定）と store 化
  - スマホモード時の書込ゲート（action-level reject）と編集 UI の非表示
  - 書込操作の種別による部分開放（§3.1 の `WriteCapability`）
  - スライドショーの縦画面対応（manifest の landscape 固定 + オーバーレイの自前回転。§4）
  - スマホモード限定の保存 / 別名で保存 / 削除導線（⋮ メニュー）
  - 一覧モードのサブ状態「一括切替モード」（§1 軸 B の下）
- 実装ファイル
  - `src/state/launchModeStore.ts` — 起動モード解決・書込 gate（§1 軸 A / 軸 C）
  - `src/state/slideStore.ts` — `editingIndex`（§1 軸 B の実体）
  - `src/state/listToolStore.ts` — 一括切替モードの状態（§1 軸 B のサブ状態）
  - `src/hooks/useBulkToggleMode.ts` — 一括切替モードの出入りとクリック処理
  - `src/components/AppMain.tsx` — モード別レイアウト分岐
  - `src/components/panels/SlideListPanel.tsx` — 一覧 / 編集ストリップ
  - `src/components/panels/SlidePlaybackPanel.tsx` — スマホモードの再生設定バー（§3.1）
  - `src/components/panels/fileIO/FileIOSubMenu.tsx` — スマホモード限定の保存 / 削除導線
  - `src/components/SlideshowShell.tsx` — スライドショーの縦画面回転とセーフエリア（§4.2）
  - `vite.config.js` — PWA manifest の `orientation: "landscape"`（§4.2）
  - `src/utils/mobileDetect.ts` — スマホ環境判定（§2.1）
- 未実装
  - 書込ゲートの網羅（現状は mutation hook 単位。store を直接書く経路は通らない。§3.2）
  - 一覧 / 編集画面の縦→横フォールバック（§4.3。スライドショー以外は端末の向きのまま）

注記:

- スマホモードでは import は「読込用途」として許可し、エクスポートは拒否する。
  保存は ⋮ メニューからの手動操作のみ許可する（§3.1）。

## 1. 用語

**モードは 2 軸ある。混同しないこと（実際に混同して実装を誤ったことがある）。**

### 軸 A: 起動モード（端末で決まる。実行中は変わらない）

| 呼び方 | コード上の表現（唯一の形） | 旧称（もう使わない） |
| --- | --- | --- |
| **PCモード** | `LaunchMode.PC` / `isPcMode()` / `pcMode` | browser mode, `ViewerMode.EDIT`, `editable` |
| **スマホモード** | `LaunchMode.MOBILE` / `mobileMode` | mobile pwa mode, `ViewerMode.VIEW`, `readOnly`, 閲覧モード |

- store は `src/state/launchModeStore.ts`（`useLaunchModeStore`）。
- PCモードは編集可能。スマホモードは閲覧中心（§3.1 の再生設定のみ例外的に書込可）。
- 判定は §2。`?mode=mobile` で PC でもスマホモードにできる（旧名 `?mode=view` も受ける）。

### 軸 B: 画面モード（実行中に切り替わる）

| 呼び方 | 意味 | コード上の表現（唯一の形） | 旧称（もう使わない） |
| --- | --- | --- | --- |
| **一覧モード** | スライド一覧が画面全体に表示されている状態 | `editingIndex < 0` / `isListMode` / `listMode === true` | 一覧選択モード, `wrap` |
| **編集モード** | 特定のスライドを編集画面で編集している状態 | `editingIndex >= 0` / `isEditMode` | 詳細編集モード, `detailMode` |

- **スマホモードは編集モードに入れない**（編集移行の導線がスマホでは描画されない）。
  したがってスマホモードでは常に一覧モードである。
- 編集モードでは一覧が画面下部のストリップ（単一行）になり、一覧モードでは複数行の
  ギャラリーとして領域いっぱいに広がる（`SlideListPanel` の `listMode` prop）。

#### 一覧モードのサブ状態: 一括切替モード

| 呼び方 | コード上の表現（唯一の形） |
| --- | --- |
| **一括切替モード** | `useListToolStore.bulkToggleActive` / `useIsBulkToggleMode()` / `bulkToggleMode` |

**軸ではない。一覧モードの中の一時的な状態**（軸を増やさないこと。増やすと軸 A / B と
混同する。過去に軸を混同して実装を誤っている）。編集モードでは存在しない。

- 目的: スライドをクリックするだけで有効 / 無効を切り替える。他の変更はさせない。
- 出入り: 一覧ヘッダ右上の Switch、または Esc。
- モード中に止めるもの: 編集 / 削除 / 複製 / 結合 / 表示尺 / 並べ替え / スライド追加 /
  ダブルクリックでの編集移行 / 右クリックメニュー / undo・redo。
  スマホでは画面下部の再生設定バーも隠す。
- サムネ上に残す操作口は無い。有効チェックボックスも隠し、状態は暗転で読ませる
  （PC / スマホとも同じ見た目）。
- クリックは `selectedIndex` を動かさない（選択ではなく値の反転）。
- 書込権限は `WriteCapability.SLIDE_PLAYBACK`（§3.1）。スマホモードでも使える。
- 詳細と設計判断は [bulk-toggle-mode-plan.md](bulk-toggle-mode-plan.md)。

### 軸 C: 書込可否（モードではないが、軸 A から決まる）

「編集」という語が軸 B の呼び名と衝突するため、書込権限側は **write** で表す。

| コード上の表現 | 意味 |
| --- | --- |
| `WriteCapability.FULL` | 文書構造・レイヤー・画像・保存など書込全般。PCモード限定 |
| `WriteCapability.SLIDE_PLAYBACK` | スライド単位の再生設定。スマホモードでも許可（§3.1） |
| `canWriteNow(action, capability)` | mutation hook 先頭の gate |
| `isWriteAllowed(mode, capability)` | 上記の純関数版 |

旧称: `EditCapability` / `canEditNow` / `isCapabilityAllowed` / `isEditable` / `useCanEdit`。

### 命名の規則（統一済み）

- 軸 A と軸 B で「編集」の語を二重に使わない。軸 A は **PC / MOBILE**、軸 B は **LIST / EDIT**、
  書込権限は **WRITE** で表す。
- 以前は `ViewerMode.EDIT`（実体は軸 A の PCモード）という命名で、軸 B の「編集モード」と
  衝突していた。実際にこれが原因で「編集モードでない場合」という条件を軸 A と誤解し、
  実装をやり直した。現在は上表の名前だけを使う（旧称はコードに残っていない）。
- 日本語も上表の太字だけを使う（「閲覧モード」「browser mode」「詳細編集モード」等は廃止）。

## 2. 起動判定仕様

### 2.1 判定入力

- 端末種別（`src/utils/mobileDetect.ts` の `isMobileEnv()`）
  - UA が携帯端末を示すか（`Android|iPhone|iPad|iPod|Mobile`）
  - UA が Mac を名乗り、かつ `navigator.maxTouchPoints > 1`（iPadOS の Mac 詐称の補正）
- 強制指定
  - URL クエリ `?mode=mobile`（旧名 `?mode=view` も受ける）

**判定入力は端末だけで、ウィンドウサイズは見ない。** 起動モードは軸 A（端末で決まり実行中に
変わらない）なので、可変の値を入力にしない。以前は「幅か高さが 900px 以下なら携帯」という
条件を併用していたが、ノート PC の縦解像度からブラウザ UI の高さを引くと 900 を割るため、
macOS Safari 等のデスクトップ環境がスマホモードで起動していた（2026-08-28 に撤去）。

display mode（`(display-mode: standalone)`）も見ない。モバイルは閲覧用途なので、
PWA かブラウザかに関わらずスマホモードに倒す。

UA 解析ライブラリは導入しない。必要なのは二値判定のみで、唯一の難所である iPadOS の
Mac 詐称は UA 文字列だけでは原理的に解けず（デスクトップ Mac と完全に同一の文字列になる）、
どのライブラリを使っても `maxTouchPoints` の併用が要るため、代替できる仕事が無い。

### 2.2 判定優先順位

1. クエリパラメータ（最優先）
2. スマホ判定なら スマホモード
3. それ以外は PCモード

### 2.3 フォールバック

- 判定不能時は PCモード
- 不正クエリ値は無視し通常判定へ

### 2.4 意図的に許容する誤判定

- **Windows のタッチ対応ノート / Surface は PCモード**。UA に携帯端末のトークンが無いため。
  これらは編集できる端末なので妥当と判断する（`maxTouchPoints` 単独判定にすると
  これらを誤って閲覧専用にしてしまう）。
- **UA は利用者が変更できる**（開発者メニュー等）。ただし iOS の「デスクトップ用サイトを表示」
  による意図しない詐称は §2.1 の `maxTouchPoints` 補正で塞がるため、実害のある経路は無い。

## 3. 機能可否マトリクス

| 機能カテゴリ                        | PCモード | スマホモード |
| ----------------------------------- | ------------ | --------------- |
| スライド一覧閲覧                    | 可           | 可              |
| スライドショー再生                  | 可           | 可              |
| スライド編集（追加/削除/並び替え）  | 可           | 不可            |
| スライド再生設定（有効/無効・表示尺・結合） | 可      | **可**（後述）  |
| スライド一括操作（全有効化/全無効化/一括削除） | 可   | 不可            |
| レイヤー編集（移動/拡縮/回転/反転） | 可           | 不可            |
| Undo/Redo                           | 可           | 不可            |
| 画像管理（追加/差し替え/削除）      | 可           | 不可            |
| 保存（上書き/新規）                 | 可           | 原則不可        |
| インポート                          | 可           | 読込のみ可      |
| エクスポート                        | 可           | 原則不可        |
| センシティブ文書の閲覧              | 可（認証後） | 可（認証後）    |

注記:

- スマホモードで「原則不可」とした項目を解放する場合は §3.1 の `WriteCapability` で種別を切る。

### 3.1 操作種別による部分開放（WriteCapability）

当初は「スマホモードなら全書込を拒否」の二値だったが、スマホで実運用したところ
「スライドショーの見え方だけは手元で直したい」という要求が出たため、書込操作を種別で分けた。

- `WriteCapability.FULL` — 文書構造・レイヤー・画像・保存など編集全般。PCモード限定。
- `WriteCapability.SLIDE_PLAYBACK` — スライド単位の**有効/無効・表示尺・結合**。スマホモードでも許可。

SLIDE_PLAYBACK に入れる基準は「破壊的でない（スライドもレイヤーも消えない）」かつ
「スライドショーの見え方しか変わらない」こと。追加/削除/複製/並び替えと一括操作は含めない
（一括操作は 1 タップの影響が全スライドに及ぶため）。

- gate 実装: `canWriteNow(action, capability)` / `isWriteAllowed(mode, capability)`
  （`src/state/launchModeStore.ts`）。`applySlideChange` の第 3 引数で渡す。
- UI: `SlidePlaybackPanel`（`src/components/panels/SlidePlaybackPanel.tsx`）。
  一覧の下の調整バーで、選択中スライドに対して操作する。配置は PC のサムネ上コントロールに
  合わせ、有効=左 / 表示尺=中央 / 結合=右。サムネ上のコントロール（25px / 16px / 10px）は
  マウス前提の寸法でタッチには小さすぎるため流用しない。
- Undo/Redo は開放していない。スマホモードでの変更も history に積まれるが undo は FULL 扱いで拒否される。
- 保存は自動化していない。⋮ メニュー >「ドキュメントを保存」「別名で保存...」の手動導線のみ。
  未保存であることは ⋮ の赤ドット（Mantine `Indicator`）とメニューのセクションラベル
  「ファイル（未保存）」で示す。

### 3.2 ゲートが掛かる範囲

`canWriteNow()` は **mutation hook の入口**にあり、操作単位では掛かっていない。

| 場所 | 守るもの |
| --- | --- |
| `useDocumentMutation` | `applySlideChange` / `applySlideChangeLive` / `recordHistory` / undo / redo |
| `useImageLibraryMutation` | 画像の追加・削除・GC |
| `useStorage` | 保存・削除（`allowInViewMode` でスマホ限定の導線だけバイパス） |
| `useFileIO` | HVD / HVZ / PNG / ZIP のエクスポート |

スライドとレイヤーの変更は `useSlideMutation` / `useLayerMutation` がすべて
`applySlideChange` の薄い wrapper なので、この 1 点で覆われる。

**ただし store を直接書く経路はゲートを通らない。** 2026-08-28 時点で 6 箇所ある
（`FileIOPanel` / `DocumentSettingsModal` ×2 / `FileIOToolbar` / `FileIOSubMenu` / `EditToolbar`）。
現在これらが安全なのは「スマホモードではその UI を描画しない」からであり、防御は §6.1 が
求める二重化になっていない。スマホで新たに何かを部分開放するときは、この経路を先に確認すること。

## 4. スマホモード画面向き仕様

### 4.1 要件

- スマホモードは横画面 UX を前提とする。
- スライドショー再生は、端末が縦でも横画面として見せる。

### 4.2 実装

**1. PWA manifest の `orientation: "landscape"`**（`vite.config.js`）

standalone 起動時に OS が向きを固定する。スマホでの主経路はこれで、アプリ側のコードは
関与しない。ブラウザのタブで開いた場合は効かない。

**2. スライドショーオーバーレイの自前回転**（`src/components/SlideshowShell.tsx`）

`isMobile && isPortrait` のとき、オーバーレイ自体を 90° 回転して長辺を横にする。
判定は端末軸（`useDeviceMode`）で行い、起動モードとは独立している。

- 外側（`inset: 0`）で safe-area まで黒を塗り、内側が回転と寸法 swap を担う二重構造。
  回転時に内側の `100vh` が safe-area を含まなくても隙間が出ないようにするため。
- `env(safe-area-inset-*)` は常に物理ビューポート基準なので、回転中は
  top←right / left←top / right←bottom / bottom←left と対応を入れ替える。
- `resize` で viewport を読み直す。回転中は `innerWidth` / `innerHeight` も swap する。

### 4.3 実装していないこと

**アプリ全体（一覧 / 編集画面）の縦→横フォールバックは無い。** 上記 2 はスライドショー
オーバーレイ限定で、それ以外の画面は端末の向きのまま表示される。

かつて `src/hooks/useOrientationLock.ts`（Screen Orientation API のロック試行 +
`<html data-orientation-fallback>` 付与）があったが、どこからも呼ばれておらず、属性を消費する
CSS ルールも存在しなかった。動かない実装を「実装済み」と誤読させるため **2026-08-28 に削除**した。
全体フォールバックが必要になったら、§4.2 の `SlideshowShell` の回転処理を土台にする方が近い。

## 5. センシティブモード連携

- 文書メタ `isSensitive=true` の場合、パスワード認証成功まで表示しない。
- 認証 UI は両モードで共通コンポーネントを使う。
- 認証失敗時は画像復号しない（安全側で非表示）。

## 6. UI 制御ルール

### 6.1 制御方式

- 起動モードは `launchModeStore` に保持し、UI の出し分けと書込 gate の両方をここから引く。
- UI で無効化する機能は「非表示」に統一する（disabled + 理由表示は使っていない）。
- UI を隠すだけでは足りない（ショートカット等で mutation が発火しうる）ため、
  書込は必ず `canWriteNow()` でも弾く（§3）。

### 6.2 起動モード別ルール

- PCモード
  - 全編集 UI を表示
- スマホモード
  - 編集系 UI 非表示
  - 閲覧・再生導線に加え、選択スライドの再生設定バー（§3.1）と
    ⋮ メニューの保存 / 別名で保存 / 削除を表示

## 7. 受け入れ基準

- PC ブラウザ起動で編集可能である。
- スマホ PWA 起動で閲覧中心の UI になる。
- スマホ縦起動でもスライドショーが横画面で成立する（§4.2。一覧 / 編集画面は対象外）。
- モードごとの可否マトリクスに反する操作が行えない。

## 8. 残タスク

初版の実装タスク（modeResolver / featureGate / モード別分岐 / 受け入れテスト）は完了済み。
現在の残りは以下。いずれも現状で運用上の支障は出ていない。

- 書込ゲートの網羅性レビュー（§3.2 の「store 直書き 6 箇所」を含む）。
- 一覧 / 編集画面の縦→横フォールバック（§4.3）。着手するか否かも未決。
