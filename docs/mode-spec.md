# モード仕様書（browser mode / mobile pwa mode）

## 目的

本書は、起動モード判定とモード別機能制御を定義する。
対象は React 移行後の単一エントリ実装（同一 HTML）を前提とする。

## 関連ドキュメント

- docs/function-list.md
- docs/migration-roadmap.md

## 実装状況（2026-06-09）

- 実装済み
  - React + Mantine Runtime Shell 導入
  - React 製 Slide List mirror（閲覧ミラー）
  - query 強制モード（`?mode=browser|mobile`）
  - standalone + mobile 判定による mode 解決
  - mobile pwa mode 時の編集/保存系初期ゲート
  - mobile pwa mode 時の readonly UI ガード（編集領域非表示）
  - action-level reject（保存/出力/背景更新）
  - readonly 時のスライド並び替え禁止
  - Viewer command / slideStore 経路の add/clone/remove/sort reject
  - FileSelector の dispose reject（保存データ削除禁止）
  - FeatureGate 粒度拡張（canImport / canDeleteSavedData）
  - 縦起動時の transform 回転フォールバック
- 実装ファイル
  - `src/react/mountRuntimeShell.tsx`
  - `src/react/RuntimeShell.tsx`
  - `src/types/styles.d.ts`
  - `src/runtime/applyFeatureGate.ts`
  - `src/runtime/mode.ts`
  - `src/runtime/featureGate.ts`
  - `src/runtime/mobileOrientation.ts`
  - `src/index.ts`
  - `src/Viewer.ts`
  - `css/index.css`
- 未実装
  - feature gate の網羅化（全編集操作単位の reject 実装）
  - orientation フォールバックの端末別最適化（セーフエリア調整など）

注記:

- mobile pwa mode では import は「読込用途」として許可し、保存/出力は拒否する。

## 1. 用語

- browser mode
  - PC ブラウザ起動時のモード
  - 編集可能
- mobile pwa mode
  - スマホ PWA 起動時のモード
  - 基本的に閲覧のみ

## 2. 起動判定仕様

### 2.1 判定入力

- display mode
  - `window.matchMedia('(display-mode: standalone)')`
- 端末種別
  - UA（補助）
  - 画面サイズ（補助）
- 強制指定
  - URL クエリ `?mode=browser|mobile`

### 2.2 判定優先順位

1. クエリパラメータ（最優先）
2. standalone かつスマホ判定なら mobile pwa mode
3. それ以外は browser mode

### 2.3 フォールバック

- 判定不能時は browser mode
- 不正クエリ値は無視し通常判定へ

## 3. 機能可否マトリクス

| 機能カテゴリ                        | browser mode | mobile pwa mode |
| ----------------------------------- | ------------ | --------------- |
| スライド一覧閲覧                    | 可           | 可              |
| スライドショー再生                  | 可           | 可              |
| スライド編集（追加/削除/並び替え）  | 可           | 不可            |
| レイヤー編集（移動/拡縮/回転/反転） | 可           | 不可            |
| Undo/Redo                           | 可           | 不可            |
| 画像管理（追加/差し替え/削除）      | 可           | 不可            |
| 保存（上書き/新規）                 | 可           | 原則不可        |
| インポート                          | 可           | 読込のみ可      |
| エクスポート                        | 可           | 原則不可        |
| センシティブ文書の閲覧              | 可（認証後） | 可（認証後）    |

注記:

- mobile pwa mode で「原則不可」とした項目は、将来要件で解放する場合も feature flag 管理で対応する。

## 4. スマホモード画面向き仕様

### 4.1 要件

- mobile pwa mode は横画面 UX を前提とする。
- 縦起動時も横画面として動作させる。

### 4.2 実装順序

1. Screen Orientation API で landscape ロックを試行
2. 失敗または非対応時は CSS transform フォールバック

### 4.3 transform フォールバック仕様

- ルートコンテナへ回転を適用
  - `transform: rotate(90deg)`
  - `transform-origin: center center`
- 表示領域の幅高さを入れ替え
  - `width: 100vh`
  - `height: 100vw`
- `resize` / `orientationchange` で再計算
- ノッチ端末のセーフエリアを考慮
- タップ座標とヒット領域のずれを許容しない

## 5. センシティブモード連携

- 文書メタ `isSensitive=true` の場合、パスワード認証成功まで表示しない。
- 認証 UI は両モードで共通コンポーネントを使う。
- 認証失敗時は画像復号しない（安全側で非表示）。

## 6. UI 制御ルール

### 6.1 制御方式

- App レベルで `mode` を保持し、feature gate で UI を制御する。
- 無効機能は「非表示」または「disabled + 理由表示」を統一する。

### 6.2 画面別ルール

- browser mode
  - 全編集 UI を表示
- mobile pwa mode
  - 編集系 UI 非表示
  - 閲覧・再生導線のみ表示

## 7. 受け入れ基準

- PC ブラウザ起動で編集可能である。
- スマホ PWA 起動で閲覧中心の UI になる。
- スマホ縦起動時でも横画面 UX が成立する。
- モードごとの可否マトリクスに反する操作が行えない。

## 8. 実装タスク（初版）

- `modeResolver` 実装
- `featureGate` 定義（機能キー一覧）
- `useOrientationLock`（API + transform フォールバック）実装
- モード別ヘッダ/メニュー分岐
- 受け入れテスト（PC、スマホPWA、縦起動）
