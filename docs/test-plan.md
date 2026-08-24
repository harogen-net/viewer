# テスト計画（段階移行）

## 目的
段階移行中の回帰を防ぎ、PCモード / スマホモード / センシティブモードを含む品質を保証する。

## 関連ドキュメント
- docs/function-list.md
- docs/migration-roadmap.md
- docs/mode-spec.md
- docs/state-management-design.md
- docs/sensitive-mode-spec.md
- docs/data-compatibility-spec.md

## 1. テスト戦略
- フェーズごとに「最小受け入れ」を定義してゲート運用する。
- 単体テスト + 結合テスト + E2E の三層で実施する。
- データ互換テストは毎フェーズで自動実行する。

### 1.1 マイグレーション変更ごとの必須確認
各マイグレーションPR/変更セットで、次を必ず実施する。

1. 変更対象機能の確認
  - 変更が触る機能（例: file I/O, slideshow, slide select）を明記する。
2. 機能保持スモーク確認
  - 変更対象機能の最低1正常系を確認する。
  - 例: file I/O 変更なら save/load/import/export のうち該当操作を実行確認。
3. 結果記録
  - 成功/失敗、確認手順、既知の制約を記録する。

## 2. テスト対象マトリクス
### 2.1 実行環境
- PC ブラウザ（Chrome 最新）
- スマホ PWA（iOS Safari PWA / Android Chrome PWA）

### 2.2 モード
- PCモード
- スマホモード

### 2.3 画面向き
- 横起動
- 縦起動（transform フォールバック経路）

### 2.4 セキュリティ
- 非センシティブ文書
- センシティブ文書（認証成功/失敗）
- アプリロック（無効 / ロック中 / 解錠済み × 生体認証あり/なし）

## 3. フェーズ別テストゲート
### Phase 1 ゲート
- 起動判定が仕様通り
- PCモード で閲覧 + スライドショー起動可能
- スマホモード で編集 UI が無効

### Phase 2 ゲート
- hvd/hvz/png の読込成功
- 保存 -> 再読込でデータ同一性（主要項目）

### Phase 3 ゲート
- 主要編集操作（移動/拡縮/回転/反転）成功
- Undo/Redo の整合
- React プロパティ入力欄で Enter / ↑↓ / ホイールによる値反映が成功
- React 補助操作パネルでスライド durationRatio（表示時間比）、キャンバス zoom、選択レイヤー position/scale/rotation/opacity の値反映が成功
- React Slide IO から全 join 切替、unjoin all、activate all、disable all、選択スライドのみ enable、remove disabled slides が成功
- React Slide IO から選択スライドの前後移動が成功し、選択状態が維持される
- React/legacy Slide IO からスライド追加/複製/削除/並び替え/join/unjoin/activate all/disable all/remove disabled slides/durationRatio（表示時間比）変更後に Undo/Redo と document modified が反映される
- React スライドリストで Enter/Space 選択、↑↓/←→ 選択移動、Home/End 先頭末尾選択、Cmd/Ctrl+矢印 並び替え、Delete/Backspace 削除が成功
- React スライドリストでキーボード連続操作時にフォーカスが対象行へ追従する
- React レイヤーリストで ↑↓ 選択移動、Enter/Space 選択、F2 rename、Delete/Backspace 削除が成功

### Phase 4 ゲート
- センシティブ文書の認証成功時のみ表示
- 認証失敗時の非表示保証

### Phase 5 ゲート
- スマホ縦起動でも横 UX が成立
- タップ座標ずれなし

### Phase 6 ゲート
- 旧実装除去後も回帰なし

## 4. テストケース（抜粋）
### 4.1 モード判定
- `?mode=mobile` で強制スマホモードになる（旧名 `?mode=view` も受ける）
- クエリ指定なし・スマホ環境でなければ PCモードになる（`?mode=browser` という指定は存在しない）
- スマホ環境判定が true でスマホモードになる

### 4.2 機能ゲート
- スマホモード でレイヤー編集 action が reject される
- スマホモード で削除・上書き操作が実行されない

### 4.3 画面向き
- 縦起動時に transform フォールバックが適用される
- orientationchange 後にレイアウトが再計算される
- ノッチ端末で UI が欠けない

### 4.4 データ互換
- v2 以降の hvd を読込できる
- v2 以降の hvz を読込できる
- 埋め込み png からデータ抽出できる
- round-trip（読込 -> 保存 -> 読込）で主要プロパティが一致

### 4.5 センシティブ
- 正しいパスワードで復号表示される
- 誤パスワードで表示されない
- 未認証のまま画像データへアクセスできない

### 4.6 履歴
- 編集 100 ステップで上限管理が機能する
- Transaction の undo/redo で整合が崩れない

### 4.7 アプリロック
詳細は docs/app-lock-spec.md。自動テストは以下でカバー済み。

- ゲート（`tests/components/appShellGate.test.tsx`）
  - LOCKED ではアプリ本体を描画しない（TopBar / スライド一覧が DOM に無い）
  - LOCKED では起動時の document 自動生成が走らない = 認証前の副作用ゼロ
  - DISABLED では従来どおり動作する（既存挙動の保持）
- 解錠（`tests/components/appLockScreen.test.tsx`）
  - 正しいパスコードで解錠、誤りでは LOCKED のまま + 失敗回数が増える
  - credential 未登録なら生体認証ボタンを出さない
  - 生体認証の失敗はパスコードのクールダウンを発動させない
- 生体認証の自動呼び出し（`tests/components/appLockScreen.test.tsx`）
  - 可視状態でマウントされると自動で解錠を試みる
  - 非表示でマウントされた時は呼ばず、可視になってから呼ぶ（再ロック経路）
  - ロック 1 サイクルにつき 1 回しか試さない
  - 失敗してもエラー表示せず、失敗回数も増やさない。ボタンとパスコードは使えるまま
- バイパス防止（`tests/hooks/useAppLock.test.tsx`）
  - 誤ったパスコードでは disableLock / changePasscode / unregisterBiometrics を拒否する
  - パスコード不要でロックを無効化する API が公開されていない
  - クールダウン中は照合せず THROTTLED を返す
- パスコード入力 UI（`tests/components/appLockScreen.test.tsx`, `tests/components/appLockSettingsModal.test.tsx`）
  - ロック画面・設定モーダルともテキスト入力欄を置かない（DOM に `input` が存在しない）
  - 0〜9 と削除キーが揃い、桁数表示が増減する。最大桁数で打ち止め
  - 最小桁数に達するまで送信ボタンが押せない
  - 物理キーボード（数字 / Backspace / Enter）でも操作できる
- 桁数到達での自動照合（`tests/components/appLockScreen.test.tsx`）
  - 桁数が分かっているときは解錠ボタンを出さず、桁数到達で自動解錠する
  - ドットは正解の桁数ぶん表示する（キーは expectedLength では塞がず、上限は最大桁数のみ）
  - 桁数に達する前は照合しない（PBKDF2 を無駄に回さない）
  - 失敗すると入力がクリアされ、そのまま打ち直して解錠できる
  - 失敗後も解錠ボタンは出さない（トルツメ）
  - 桁数を持たない旧レコードは解錠成功時に桁数が補完される
  - 設定モーダルは 1 画面 1 キーパッド、明るい配色（`tone="light"`）
- 設定のステップ遷移（`tests/components/appLockSettingsModal.test.tsx`）
  - 有効化: 説明 → 入力 → 確認 → 生体認証の確認 → 完了
  - 確認が一致しなければ入力画面へ戻し、有効化しない
  - 変更: 現行が違えば新規入力へ進ませない
  - 無効化: 誤ったパスコードでは無効化されない
  - 生体認証の登録はパスコード不要、解除は必要
  - 閉じて開き直すと入力が持ち越されない
- 永続化（`tests/state/appLockStore.test.ts`）
  - UNLOCKED は localStorage に一切書かれない（リロードで必ず再ロック）
  - レコードが無い / 壊れている場合は DISABLED（fail-open）
- 再ロック / 解錠セッション（`SESSION_TIMEOUT_MS` で分岐、docs/app-lock-spec.md §6）
  - `= 0`（現在の既定、`tests/hooks/useAppSession.test.tsx`）: hidden / pagehide / freeze で即ロック。visible のままの visibilitychange ではロックしない。スライドショー再生中でも即ロックする。解錠中以外は監視しない、アンマウント後は無反応
  - `> 0`（セッション方式、`tests/hooks/useAppSessionTimeout.test.tsx`。定数を `vi.mock` で差し替えてテスト）: 無操作で設定時間が経つとロックし、それ未満ではロックしない。操作（pointerdown / keydown / wheel / touchstart）でセッションが延長される。セッション内の復帰では再認証を求めない。セッション切れの復帰（visibilitychange / pageshow）でロックする。表示中の再生（スライドショー）はセッションを延長し、再生終了後も設定時間は解錠が続く。非表示のまま再生していても延長されない。期限切れの復帰では再生中でもロックする
- 検証子 / WebAuthn（`tests/utils/appLockPasscode.test.ts`, `tests/utils/webauthnLock.test.ts`）
  - 検証子に平文パスコードも sentinel 文字列も現れない
  - kdfIterations を下限未満へ書き換えたレコードを拒否する（ダウングレード防止）
  - create/get に `userVerification:"required"` と `platform` を渡す、`rp.id` を指定しない
  - challenge は 32 byte かつ呼び出しごとに異なる

## 5. 自動化方針
- 単体
  - reducer/command/adapter を中心に実装
- 結合
  - ストア + usecase の結合検証
- E2E
  - 主要シナリオ（閲覧、編集、保存読込、センシティブ解錠）

## 6. テストデータセット
- `fixtures/legacy/v2/*.hvz`
- `fixtures/legacy/v2/*.hvd`
- `fixtures/legacy/png/*.png`
- `fixtures/sensitive/*.hvd`

### 6.1 Phase2 最小 fixture セット
- `fixtures/legacy/v2/compat_v2_minimal.hvd`
- `fixtures/legacy/v2/compat_v2_minimal.hvz`
- `fixtures/legacy/png/compat_png_embedded_minimal.png`
- `fixtures/sensitive/sensitive_locked_sample.hvd`

実行チェック:
- `npm run check:phase2-fixtures`
- 期待値: 0 exit（不足ファイルなし・各 fixture が最小サイズ以上）
- NG時: missing/tooSmall の内訳と summary が表示される
- 総合実行: `npm run check:phase2`

互換チェック（実データ解析）:
- `npm run gen:phase2-png-fixture`
- `npm run check:phase2-compat`
- 期待値: hvd/hvz/png埋め込みの解析が成功し、version と slide 数の整合が取れる

### 6.2 round-trip 最小観点（Phase2）
- 入力: `compat_v2_minimal.hvd`
- 手順: load -> save(override) -> load
- 検証項目:
  - `ViewerDocument.bgColor`
  - slide 数
  - 各 slide の `durationRatio/joining/disabled`
  - layer 数
  - 先頭 layer の transform（`transX/transY/scaleX/scaleY/rotation`）

実行チェック（fixture間整合の自動検証）:
- `npm run check:phase2-core-fields`
- 期待値: hvd/hvz/png 埋め込みの主要項目（bgColor, slide数, 先頭slide項目, 先頭layer transform）が一致

構造等価チェック（fixture間整合の強化）:
- `npm run check:phase2-structure`
- 期待値: hvd/hvz/png 埋め込みの JSON 構造全体（キー順を正規化後）が一致
- NG時: 最初に不一致となった JSON path（例: `$.slideData[0].layers[1]`）が出力される
- 実行時: `artifacts/phase2/structure-check-report.json` に検証結果（OK/NG と mismatch詳細）を出力
- 差分詳細: source ごとに最大 `PHASE2_STRUCTURE_MAX_DIFFS` 件（デフォルト 10 件）の差分を記録

CI実行時のレポート収集:
- `.github/workflows/phase2-check.yml` で `artifacts/phase2/` を artifact として保存
- 期待値: 失敗時も差分レポートをダウンロードして原因を特定できる

レポート整合チェック:
- `npm run check:phase2-reports`
- 期待値: structure/error-case/error-fixture の3レポートが存在し、スキーマと `ok === true` を満たす
- 追加検証: error-case / error-fixture の label 集合が期待値と一致する
- 実行時: `artifacts/phase2/phase2-report-summary.json` に統合サマリーを出力

センシティブ fixture 最小妥当性:
- `npm run check:phase2-sensitive`
- 期待値: `isSensitive === true` かつ version/slideData が妥当

エラーケース最小妥当性:
- `npm run check:phase2-error-cases`
- 期待値: unsupported version / imageData欠落 / PNG署名不正 などの失敗系を検知できる
- 実行時: `artifacts/phase2/error-case-report.json` にケース別の期待値・実際メッセージを出力

異常fixture妥当性（実ファイルベース）:
- `npm run check:phase2-error-fixtures`
- 対象: `fixtures/error/unsupported_v1_sample.hvd`, `fixtures/error/broken_payload_sample.hvz`, `fixtures/error/broken_embed_sample.png`
- 期待値: 各fixtureで想定した失敗が検出される
- 実行時: `artifacts/phase2/error-fixture-report.json` にfixture別結果を出力

### 6.3 エラー分類（Phase2）
- `UNSUPPORTED_VERSION`
  - v1 または version 未定義データを読込時に reject
- `PARSE_ERROR`
  - JSON parse 失敗、zip 展開失敗、PNG 埋め込み抽出失敗
- `MISSING_ASSET`
  - `imageData` 不足により画像復元に失敗
- `STORAGE_IO_ERROR`
  - IndexedDB read/write/delete の失敗
- `PERMISSION_DENIED`
  - feature gate により save/export/import/delete を拒否

注記:
- 実ファイル配置は実装時にプロジェクト構成へ合わせる。

### 6.4 Phase3 実行記録
- 2026-06-15: React レイヤーリストのキーボード操作判定を `getLayerListKeyboardAction` として単体化し、RuntimeShell / SideControls から利用する形に更新。選択/削除/rename 後のフォーカス追従も実装。
- 確認: `npm run test:usecase`
- 結果: 22 tests / 22 pass。Enter/Space 選択、上下/Home/End 移動、F2 rename、Delete/Backspace 削除、readonly拒否の判定を確認。
- 2026-06-15: React Edit ボタンから select mode -> edit mode へ入る経路のガードを修正。Undo/Redo 後に React 編集パネルへ選択状態・レイヤー一覧・キャンバス状態を再通知する経路を追加。
- 確認: `npm run test:usecase`
- 結果: 22 tests / 22 pass。
- 2026-06-15: React PropertyControls の clip 4辺直接入力を `setSelectedImageClip` 経路へ変更し、1回の入力確定が1つの履歴ステップになるよう更新。cut/paste/add text/remove/spread 後の React 編集状態再通知も強化。
- 確認: `npm run test:usecase`
- 結果: 22 tests / 22 pass。
- 2026-06-15: RuntimeShell に clip 4辺の直接入力を追加し、clip ステップボタンも `setSelectedImageClip` 経路へ統一。レイヤー順序変更後に React レイヤー一覧へ即時再通知するよう更新。数値入力ホイール方向判定を `getWheelInputDelta` として単体化。
- 確認: `npm run test:usecase`
- 結果: 23 tests / 23 pass。
- 2026-06-15: RuntimeShell の boolean 状態操作（slide join/disabled、rect edit、layer mirror/visible/locked/shared/isText、slideshow mirror/fullscreen、images panel）を Mantine Switch UI へ変更。
- 確認: `npm run test:usecase`
- 結果: 23 tests / 23 pass。
- 2026-06-15: SideControls の clip 増減も `setSelectedImageClip` 経路へ統一し、未使用になった delta 指定の clip command を削除。RuntimeShell の durationRatio 入力下限を Slide model と同じ 0.2 へ揃え、blur/click 適用処理を共通化。
- 確認: `npm run test:usecase`
- 結果: 23 tests / 23 pass。
- 2026-06-15: clip 4辺入力の parse/増減ロジックを `numericInput` の純粋ヘルパーへ共通化し、RuntimeShell / SideControls の重複を削減。React 描画のスライド一覧コンテキストメニューに `ViewerCommands` 経由の click handler を追加し、メニュー項目の実行経路を React 側へ移行。
- 確認: `npm run test:usecase`
- 結果: 27 tests / 27 pass。
- 2026-06-15: SideControls の mirrorH/mirrorV/isText とレイヤー一覧 visible/locked/shared ボタンへ ON 状態 class と `aria-pressed` を追加し、CanvasMenu の rect edit / direction pulldown も bridge/local state に応じた class/aria 属性へ同期。
- 確認: `npm run test:usecase`
- 結果: 27 tests / 27 pass。
- 2026-06-15: MainShell の編集キーボードショートカット判定を `getMainShellKeyboardAction` として単体化し、copy/cut/paste、Undo/Redo、Escape、Delete/Backspace、Arrow nudge の分散 effect を1経路へ集約。
- 確認: `npm run test:usecase`
- 結果: 31 tests / 31 pass。
- 2026-06-15: CanvasMenu の選択スライドID表示を `useViewerSlides` に移し、EditViewController の `span.name` 直接DOM更新を削除。Edit/List controller の legacy click/change/disabled/hide 処理は `data-react-controlled` 要素へバインド・更新しないよう整理。スライド一覧コンテキストメニューの表示位置/show/hide を `listContextMenuRequested` bridge event と React state 管理へ移行。Legacy React re-export の重複も整理。
- 確認: `npm run test:usecase`
- 結果: 31 tests / 31 pass。
- 2026-06-15: React スライド一覧に HTML drag/drop による並び替えを追加し、`getSlideListDropAction` として D&D 判定を単体化。`ViewerCommands.moveSelectedSlideToIndex` から `ListViewController.moveSelectedSlideToIndex` へ通す任意index移動経路を追加し、Undo/Redo 対応の履歴コマンドで実行する形へ更新。React 行の右クリックから既存 React context menu を開く経路も追加。
- 確認: `npm run test:usecase`
- 結果: 33 tests / 33 pass。
- 2026-06-15: React レイヤー一覧に HTML drag/drop による並び替えを追加し、`getLayerListDropAction` として D&D 判定を単体化。`ViewerCommands.moveSelectedLayerToIndex` から `EditViewController.moveSelectedLayerToIndex` へ通す任意index移動経路を追加し、Undo/Redo 対応の履歴コマンドで実行する形へ更新。
- 確認: `npm run test:usecase`
- 結果: 35 tests / 35 pass。
- 2026-06-15: React レイヤー一覧の Cmd/Ctrl+↑↓ を順序変更操作へ対応し、RuntimeShell / SideControls のキーボード経路から既存レイヤー順序変更コマンドを実行する形へ更新。
- 確認: `npm run test:usecase`
- 結果: 37 tests / 37 pass。
- 2026-06-15: React スライド行右クリック時の context menu 座標計算を `RuntimeShell` の legacy DOM 参照から `ListViewController.requestSlideContextMenuByIndex` 側の offset 計算へ移し、React 側の `document.querySelector("#main .list")` 依存を削除。
- 確認: `npm run test:usecase`
- 結果: 37 tests / 37 pass。
- 2026-06-15: CanvasMenu のテキストレイヤー追加を `window.prompt` から React 管理の入力フォームへ移行。spread 操作は CanvasMenu / RuntimeShell の React 確認UIから `ViewerCommands.spreadSelectedLayer(true)` へ通し、EditViewController 側の確認ダイアログ依存を削除。
- 確認: `npm run test:usecase`
- 結果: 37 tests / 37 pass。
- 2026-06-15: AppShell / MainShell へ `FeatureGate` を渡し、CanvasMenu / SideControls / `getMainShellKeyboardAction` が `canEdit=false` を参照して編集UI・編集ショートカットを無効化するよう更新。
- 確認: `npm run test:usecase`
- 結果: 37 tests / 37 pass。
- 2026-06-15: React スライド/リストコンテキストメニューへ `canEdit` を通し、readonly 時は requested menu を破棄しコマンド実行も抑止するよう更新。RuntimeShell の右クリック経路と ListViewController の bridge 発火経路にも編集ゲートを追加し、`getListContextMenuState` / `canRunListContextMenuCommand` の usecase テストを追加。
- 確認: `npm run test:usecase`
- 結果: 40 tests / 40 pass。
- 2026-06-15: RuntimeShell の Images パネル表示を `getImagesPanelOpenState` / `canToggleImagesPanel` へ切り出し、readonly 時は React 側でも閉じる・操作できないよう更新。CanvasMenu のスライドダウンロードと Viewer の画像ダウンロード入口に `canExport` ゲートを追加し、legacy download event も command 経由へ集約。New Doc は変更済み時に RuntimeShell の React 確認UIから `ViewerCommands.newDocument(true)` へ通し、React 経路の `window.confirm` 依存を削減。
- 確認: `npm run test:usecase`
- 結果: 43 tests / 43 pass。
- 2026-06-15: RuntimeShell の Save を React の Overwrite / New Save / Cancel 選択UIへ移し、`ViewerCommands.saveDocument(override)` から Viewer へ保存方針を明示する形に更新。Import も変更済み時は RuntimeShell の React 確認UIから `ViewerCommands.openImportDialog(true)` へ通し、React File IO 経路の `window.confirm` 依存を追加削減。`canRequestSaveChoice` / `getSaveChoiceOpenState` の usecase テストを追加。
- 確認: `npm run test:usecase`
- 結果: 46 tests / 46 pass。
- 2026-06-15: Images パネルの画像 dblclick 削除確認を React 管理コンテナでは `imageDeleteRequested` bridge event へ移し、RuntimeShell の React 確認UIから `ViewerCommands.deleteImageById(imageId, true)` を実行する形へ更新。非Reactコンテナでは従来confirmを維持し、削除後は Viewer 側からスライド/編集/履歴状態を再通知するよう補強。`getImageDeleteRequestState` の usecase テストを追加。
- 確認: `npm run test:usecase`
- 結果: 49 tests / 49 pass。
- 2026-06-15: shared layer 削除時の追加削除確認を React 確認UIへ移行。Viewer の `commandRemoveSelectedLayer(confirmedSharedRemoval)` で shared 連動削除が必要な場合のみ `sharedLayerRemovalRequested` bridge event を発火し、RuntimeShell から確認済み削除を実行する形に更新。React 購読者がいない場合は従来confirmへフォールバックし、`getSharedLayerRemovalRequestState` の usecase テストを追加。
- 確認: `npm run test:usecase`
- 結果: 52 tests / 52 pass。
- 2026-06-15: 全スライド無効時の Export All で `ViewerDocument.downloadImage()` 内の browser alert に到達する前に Viewer command 側で `showNotice` を出して停止するよう更新し、React操作経路のブラウザalert依存を削減。
- 確認: `npm run test:usecase`
- 結果: 52 tests / 52 pass。
- 2026-06-15: legacy spread ボタンの直書きconfirmを `requestSpreadSelectedLayer` → Viewer command → `spreadLayerRequested` bridge event へ集約し、RuntimeShell の既存React確認UIを開く形に更新。React購読者がいない場合は Viewer command 側の従来confirmへフォールバック。`getSpreadLayerRequestState` の usecase テストを追加。
- 確認: `npm run test:usecase`
- 結果: 55 tests / 55 pass。
- 2026-06-15: legacy text ボタンの `prompt("insert text layer:")` を `requestTextLayerInput` → Viewer command → `textLayerInputRequested` bridge event へ移し、RuntimeShell のReactテキスト入力へフォーカスする形に更新。React購読者がいない場合のみ従来promptへフォールバック。`getTextLayerInputRequestState` の usecase テストを追加。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: `EditViewController` の legacy button binding 直書き編集処理（cut/copy/rotate/align/mirror/isText/transform copy-paste/fit/layer order/download image）を `requestEditCommand` / `requestDownloadSelectedImage` event 経由で Viewer command に集約。React 側と同じ command gate / bridge 更新経路を通るようにし、旧UI内の履歴操作直書きを縮小。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: legacy undo/redo/paste/zoom/slide download/text/spread/rect edit/close edit を `requestEditCommand` 経由へ追加集約し、`ListViewController` の legacy context/prev-next/new/clone/delete 操作も `requestListCommand` 経由で Viewer command に集約。旧 controller から個別 `request...` event と `VMToggleButton` 直操作を削減。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: legacy レイヤー一覧の visible/locked/shared/delete/選択 とサムネイルの joining/disabled/duration 操作を Viewer command 経由に集約。未使用になった legacy binding helper と関連インターフェースを削除。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: `EditViewController` に残っていた旧編集ボタン/画像差し替えinput/undo-redo disabled同期のDOM bindingを削除し、React `AppShell` / `CanvasMenu` / `SideControls` の `ViewerCommands` 経路へ一本化。`requestEditCommand` の Viewer 側受け口も legacy レイヤー一覧 fallback 用の選択/visible/locked/shared/delete のみに縮小。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: `ListViewController` の旧context menu DOM binding/show-hide fallbackを削除し、右クリックは `listContextMenuRequested` bridge event でReact `ListContextMenus` を開く経路へ一本化。React `LayerControls` へ移行済みのため、旧 `EditLayerViewController` / `EditLayerListItem` fallback と `requestEditCommand` listenerを削除。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: `ThumbSlideView` / `ListViewController` から旧サムネイル内の delete/clone/edit/duration/joining/disabled 操作UIと new/prev/next list button、`requestListCommand` listenerを削除。サムネイルは表示・選択・右クリック・ダブルクリック編集に限定し、スライド操作はReact `RuntimeShell` / `ListContextMenus` / `ViewerCommands` 経路へ集約。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: 未参照のReact `Legacy*` alias/exportファイルを削除し、paste/transform paste の可否を `EditableSlideView` 内部状態から `editLayerStateChanged` bridge eventへ公開。React `CanvasMenu` / `RuntimeShell` / `CopyPasteControls` / keyboard handlerはbridge stateで貼り付け可否を判定し、旧 `.paste` DOM disabled同期を削除。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: `SlideShowViewController` が生成していた close/fullscreen/mirror/prev/next の旧DOMボタンを削除し、再生状態を `slideshowPlaybackChanged` bridge eventでReactへ公開。スライドショー中は `RuntimeShell` のReact overlayから停止/前後移動/pause/fullscreen/mirrorを `ViewerCommands` 経由で操作する形へ移行。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: Viewer command 直呼び時の New Doc / Import / Save / Delete Image 確認を bridge request 化し、React RuntimeShell の既存確認UIを開く経路へ移行。画像削除request受信時はReact Imagesパネルも自動で開くようにして、command経由でも確認操作が見える形に更新。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: ストレージ読み込み進捗を旧 `ProgressBar` のjQuery DOM更新から `storageProgressChanged` bridge event + React `RuntimeShell` の進捗バー表示へ移行。未参照の空 `ProgressViewController` と旧ProgressBarクラスを削除。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: `showNotice` を `#appNotice` 直接DOM更新から `noticeChanged` bridge event + React `RuntimeShell` 通知表示へ移行し、HTML/CSSの旧noticeホストを削除。`alert` / `window.confirm` / `prompt` の実行コードと古いコメントも削除し、確認・入力はReact request UIへ集約。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: Import用hidden file inputを Viewer の `document.createElement("input")` 生成から React `RuntimeShell` 管理へ移行。Viewer は `importFileDialogRequested` request と `commandImportFile(file)` の処理だけを持ち、React側でファイル選択とFile受け渡しを担当する形に更新。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: RuntimeShell へ移行済みで空になっていた legacy `PrefPanel` / `#pref` host / preference CSS / readonly時のpref非表示処理を削除。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: React RuntimeShell 管理に移行済みの Images パネルから、存在しない旧toggle button用CSSと旧containerレイアウトCSSを削除。画像サムネイル自体のスタイルのみ残し、パネル表示位置・サイズはReact側管理へ一本化。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-15: RuntimeShell と重複していた MainShell の旧 `CanvasMenu` / `SideControls` / `ListContextMenus` を削除し、MainShell は legacy controller 用の `.canvas` / `.list` host とキーボード処理だけに縮小。旧context menu bridge/command/controller経路と専用CSSも削除し、RuntimeShell の可視入力を Mantine `TextInput` / `Textarea` / `ColorInput` / `FileButton` へ統一。
- 確認: `npm run test:usecase`
- 結果: 55 tests / 55 pass。
- 2026-06-16: Images パネルのサムネイルDOM生成を `ImageManager` から削除し、`imageLibraryChanged` bridge event 経由で RuntimeShell が画像一覧をReact描画する形へ移行。画像drag開始とdblclick削除requestもRuntimeShell側イベントに集約し、画像dropによる新規スライド作成も RuntimeShell slide list drop -> `ViewerCommands.addImageSlide` へ移行。旧 `#images` host / `ImagesPanel` / images container registry / 専用CSSを削除。ReactスライドリストD&Dと重複していた `ListViewController` のjQuery UI sortable経路も削除し、未使用になった `jquery-ui-dist` / `@types/jqueryui` 依存を削除。
- 確認: `npm run test:usecase`
- 結果: 55 tests / 55 pass。
- 2026-06-16: React RuntimeShell のスライド一覧と重複していた legacy サムネイルDOMを削除し、`ListViewController` をスライド配列・選択状態の管理だけに縮小。`ThumbSlideView` / `CanvasSlideView`、旧 `.slideList` CSSを削除し、`.list` host は React `MainShell` の表示用スライドリストとして復旧。編集キャンバスの表示CSSは Viewer が付与する `body` の mode class に合わせて整理。DOMなし削除時の選択保持を usecase テストで追加確認。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-16: `src/view` 配下の残存 view クラスファイル（LayerView / SlideView / DOMSlideView / EditableSlideView / AdjustView / ImageView / TextView）を React 移行準備として `.tsx` へ変更。現段階では既存DOM viewクラスを維持し、今後コンポーネント化するものは `export const XxxComponent = () => { return <></>; }` 形式で追加する方針に統一。
- 確認: `npm run test:usecase`
- 結果: 58 tests / 58 pass。
- 2026-06-16: `AdjustView` を class から `export const AdjustView = () => { return ... }` 形式のReactコンポーネントへ移行。操作ハンドルUIは `AdjustViewComponent` としてReact描画し、`AdjustView` 内のjQuery `$` 利用を廃止。既存 `EditableSlideView` からの `startDrag` / `base_scale` / `targetLayerView` 接続は `AdjustViewHandle` ref 経由へ置換。
- 確認: `npm run test:usecase`、browser reload smoke（5174）
- 結果: 58 tests / 58 pass。5174でpage error/request failedなし、`.controls` 1件 / `.frame` 1件 / `.anchor` 4件を確認。

## 7. 非機能テスト
- 初期表示時間
- スライドショー遷移の体感遅延
- 大量スライド/大量画像でのメモリ使用量

## 8. 不具合運用
- 優先度
  - P0: データ破損/表示漏えい
  - P1: 主要機能停止
  - P2: 操作性/表示崩れ
- 再現情報
  - モード、端末、向き、入力データ、手順を必須記録

## 9. 受け入れ基準（総合）
- フェーズゲートを連続で通過する。
- P0 未解決ゼロ。
- P1 は合意済み件のみ残件許容。
- browser/mobile の必須シナリオが全て成功する。

## 10. R0 ベースライン（合理化ロードマップ起点 / 2026-06-16）

[docs/migration-roadmap.md](migration-roadmap.md) の R0 安全網として、撤去対象の現状値を固定する。
以降の各 R フェーズはこの値からの「減少」を完了判定に用いる。

### 10.1 回帰最小セット
- 確認: `npm run test:usecase`
- 結果: **71 tests / 71 pass**（緑）。これを R1 以降の不変ベースラインとする。

### 10.2 撤去対象ベースライン（KPI 初期値）

| 指標 | R0 実測 | 目標 | 主な所在 |
|------|--------|------|---------|
| jQuery 依存ファイル | 4 | 0 | `index.ts` / `Viewer.ts` / `runtime/SlideShowRuntime.ts` / `utils/LayerViewFactory.ts` |
| `Viewer.shared` 参照ファイル | 2 | 0 | `Viewer.ts` / `bridge/ViewerCommands.ts` |
| `ViewerBridge` イベント種別 | 19 | 0 | `bridge/ViewerBridge.ts` |
| `EventDispatcher`/`PropertyEvent` 参照ファイル | 17 | 0 | model 4 / view 5 / utils 4 / runtime 1 / events 2 / `Viewer.ts` |
| `any`（型注釈・キャスト）出現 | 52（16 ファイル） | 0 | runtime 2 / utils 6 / model 4 / view 3 / events 1 |
| `innerHTML` 直書き | 1 | 0 | `view/layer/TextView.tsx` |
| 命令的 View クラス | 3 | 0 | `LayerView` / `ImageView` / `TextView` |
| 二重 React root | 2 | 1 | `#wrapper` / `#react-runtime-shell` |
| `RuntimeShell.tsx` 行数 | 2,413 | < 400/コンポーネント | `react/RuntimeShell.tsx` |
| `Viewer.ts` 行数 | 1,700 | < 300 | `Viewer.ts` |

### 10.3 tsconfig 現状
- `strict: false` / `noImplicitAny` 無効（コメントアウト）。
- R フェーズで `any` を解消した領域から段階的に `strict` 系を有効化する（一括有効化はしない）。

### 10.4 計測コマンド（再現用）
```sh
# 回帰最小セット
npm run test:usecase
# jQuery 依存ファイル
grep -rln "from \"jquery\"" src
# Viewer.shared 参照
grep -rln "Viewer.shared" src
# EventDispatcher / PropertyEvent 参照
grep -rln "EventDispatcher\|PropertyEvent" src
# any 出現数
grep -rEn ":\s*any\b|as any|<any>|any\[\]" src | wc -l
```
