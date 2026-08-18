# アプリロック詳細仕様（スマホ限定の起動ゲート）

## 目的

スマホでこのアプリを開いたとき、認証を通すまでアプリ本体を表示しない。センシティブ文書はパスワードで保護されているが、**それ以外の通常文書には何のガードもなく、開いた時点で中身が見えてしまう**。端末を他人が手に取ったときに中身を見られないよう、PC の編集モードより 1 段強いゲートをスマホにだけ掛ける。

想定する挙動:

1. 起動するとロック画面が出る
2. 生体認証（Face ID / Touch ID / 指紋）もしくはパスコードで解錠 → 通常 UI
3. バックグラウンドに回して復帰したら再びロック画面

## 関連ドキュメント

- docs/sensitive-mode-spec.md（センシティブ文書のパスワード。**本機能とは別軸**）
- docs/mode-spec.md（browser mode / mobile pwa mode の判定）
- docs/function-list.md §14
- docs/test-plan.md §2.4 / §4.7

---

## 1. 脅威モデル（この機能が何を守り、何を守らないか）

非センシティブ文書とサムネイルは IndexedDB に**平文**で保存されている（`src/utils/storageCodec.ts` の `serializeHvd`）。したがって本機能は**表示レイヤーのゲートであり、暗号学的な保護ではない**。

**守る**

- ロック解除済みの端末を他人が手に取り、アプリを開いて中身を見る

**守らない**

- Web Inspector を繋げられる相手。解錠は in-memory の状態遷移に過ぎず、DevTools から `appLockStore` の `status` を書き換えれば突破できる
- IndexedDB を直接読む相手（そこに平文の文書がある）
- 同一オリジンに配置された他のコード（GitHub Pages のプロジェクトページは同一アカウント内でオリジンを共有する）
- iOS のアプリスイッチャーが撮るスナップショット（後述 §6）

センシティブ文書の暗号化（docs/sensitive-mode-spec.md）とは保護レベルが異なる。あちらは「保存データがパスワードなしには復号できない」実効的な保護、こちらは「カジュアルに覗かれない」表示ゲート。**この区別を UI の文言でも曖昧にしないこと。**

### 1.1 WebAuthn PRF 拡張を使わない理由

WebAuthn の PRF 拡張を使えば、生体認証から決定論的な鍵材料を取り出して暗号鍵をラップできる。本機能では採用しない。守る対象（IndexedDB の文書）が平文である以上、認証側だけ暗号学的に強化しても全体の保護強度は上がらず、複雑さと対応ブラウザの制約だけが増える。

この判断には副次的な利点がある。鍵をラップしていないので「パスコードを忘れる = データを復号できなくなる」ではなく「パスコードを忘れる = データを捨てる決断をする」で済む。結果として**非破壊のバックドアを一切用意せずに設計できる**（§5）。

### 1.2 署名を検証しないことの評価

サーバが存在しない（GitHub Pages の静的配信）ため、この設計の WebAuthn は暗号学的保証を一切提供しない。challenge の鮮度を誰も検証せず、署名を誰も検証しない。

それでも採る根拠は、**Web には OS の生体認証プロンプトを呼び出す手段が `navigator.credentials` 以外に存在しない**こと。§1 の脅威モデルの攻撃者（端末を手に取った他人）は OS の Face ID プロンプトを突破できない。ここで WebAuthn が提供しているのは暗号ではなく OS レベルの UI ゲートであり、その用途では機能する。

---

## 2. 確定仕様

| 項目 | 決定 | 理由 |
|---|---|---|
| 適用範囲 | **スマホ環境なら常に**（`isMobileEnv()` が真） | PWA standalone 限定にすると、同じ端末の Safari タブから同じ IndexedDB を開けてしまい抜け道になる |
| 解錠手段 | WebAuthn（`userVerification:"required"`）+ アプリ独自パスコード（必須） | WebAuthn は Face ID 失敗時に OS が端末パスコードへ落としてくれる。アプリ側パスコードは WebAuthn 非対応・未登録・認証情報消失時の唯一の手段 |
| 再ロック / セッション | `SESSION_TIMEOUT_MS` で切替（§6）。**現在は `0` = 猶予なし即ロック**。`> 0` にするとセッション方式（最後の操作から N ms 有効、操作ごとに延長、セッション中はバックグラウンド復帰でも再認証しない） | 当初は即ロックで作り、通知センターを引いただけで再認証が走る負担からセッション方式（5 分）に変更したが、実機で試した結果セッションの猶予は不要と判断し即ロックへ戻した。両方の実装を定数の分岐として残している |
| 有効化 | **設定で opt-in**（初期状態は無効） | |
| パスコード形式 | ASCII 数字 4〜32 桁 | 自作 10 キーで入力（§7.4）。正規化はしない（§3.2） |

PC には一切ロックが掛からない。設定 UI もスマホ限定で表示する（設定は端末ローカルなので、PC で登録してもスマホには何の効果もない）。

---

## 3. データ仕様

### 3.1 永続レコード

`localStorage` のキー `appLock.v1` に単一の JSON として保存する（`src/types/AppLock.ts` の `AppLockRecord`）。

| フィールド | 内容 |
|---|---|
| `version` | レコード形式のバージョン（`SecurityMeta.version` とは独立） |
| `verifier` | パスコード検証子（`EncryptedPayload`） |
| `userHandle` | WebAuthn `user.id`（base64、16 byte random） |
| `credentialId` | WebAuthn credential の `rawId`（base64）。生体未登録なら `null` |
| `failureCount` | 連続失敗回数。解錠成功で 0 に戻る |
| `passcodeLength` | パスコードの桁数（optional）。桁数到達での自動照合に使う（§7.4） |

**解錠済みフラグは決して保存しない。** `status` は zustand のメモリ上のみに持つ。これによりリロードや Service Worker の `autoUpdate` による再読み込みで必ずロックへ戻る（docs/sensitive-mode-spec.md §1.5 の「セッションパスワードを永続化しない」と同方針）。`tests/state/appLockStore.test.ts` に回帰テストがある。

zustand の `persist` ミドルウェアは使わない（リポジトリ全体で未使用）。`localStorage` を try/catch で直接叩く（前例: `src/components/panels/ImageLibraryPanel.tsx` の `imageLibrary.cols`）。

### 3.2 パスコード検証子

**方式**: 既知の sentinel 平文をパスコード由来の鍵で AES-GCM 暗号化し、その暗号文を保存する。検証は復号が成功するかで判定する。

これは docs/sensitive-mode-spec.md §3 の「検証用ハッシュ（`hashHint`）を持たず、AES-GCM の認証タグに検証を委ねる」方針と同一構造。高速ハッシュのオラクルを作らず、1 回の検証コストが PBKDF2 1 回分に固定される。副次的に、正誤に関わらず所要時間がほぼ一定になるためタイミングオラクルも生じない。

- KDF: PBKDF2-HMAC-SHA256、150,000 回（`sensitiveCrypto.ts` の `KDF_ITERATIONS` と共通）
- 暗号: AES-256-GCM
- salt / iv はインストールごとにランダム生成

**`encryptImageData` を直接流用しない。** 技術的には動くが、検証子は永続化されて長期間残る唯一のレコードである一方、文書ペイロードは保存のたびに再生成される。将来 imageData 側に圧縮や chunk 分割が入るとロックが静かに壊れ、ユーザーが自分の端末から締め出される。汎用の `encryptJson` / `decryptJson` を経由する。

**パスコードの正規化はしない**（`normalize("NFKC")` 等）。後から正規化を足すと既存の検証子と一致しなくなり、全ユーザーが解錠できなくなる。入力側で ASCII 数字のみに制限する。

**正直な評価**: この検証子のオフライン総当たり耐性は、本機能では実質的に無意味。`localStorage` を読める攻撃者は同一オリジンの IndexedDB（平文文書）も読めるので、パスコードを割る動機がそもそも無い。それでも PBKDF2 + AES-GCM を採るのは、強度のためではなく (a) リポジトリに「弱い検証子」の前例を作らないため、(b) 既存資産の再利用コストが実質ゼロだから。

### 3.3 既存バグの修正（前提）

`sensitiveCrypto.ts` の `deriveKey` はモジュール定数 `KDF_ITERATIONS` をハードコードしており、復号時にレコードの `security.kdfIterations` を読んでいなかった。この状態では `KDF_ITERATIONS` を変更した瞬間に保存済みセンシティブ文書がすべて復号不能になる。

ロックの検証子は文書より長寿命なのでこの欠陥をより強く受けるため、先に修正した:

- `deriveKey(password, salt, iterations)` にし、復号側はレコードの値を渡す
- ダウングレード防止に下限ガード（`MIN_KDF_ITERATIONS = 100_000` 未満は throw）。細工したレコードで反復回数を落とし KDF の遅延を無効化する攻撃を防ぐ
- 暗号化側は現行 `KDF_ITERATIONS` のまま

---

## 4. 状態遷移とゲート

### 4.1 状態

`src/types/AppLock.ts` の `AppLockStatus`（const オブジェクト + 派生型）:

- `DISABLED` — 未設定、または PC 環境。ゲートしない
- `LOCKED` — 認証待ち。アプリ本体を一切描画しない
- `UNLOCKED` — 通常表示

「無効」を `null` にせず状態として持つことで、ゲート側の分岐が `status` 1 本で済む。

初期 `status` は**モジュール初期化時に同期的に確定**する（`viewerModeStore` と同方針）。`useEffect` で後からロックすると通常 UI が 1 フレーム描画されてしまう。

### 4.2 fail-open

レコードが無い / 壊れている / `localStorage` が使えない場合、**ロックせずに起動する**。

fail-closed を選ぶとレコードが飛んだユーザーは解錠不能になり、全データ消去しか道がなくなる。守っている対象が暗号化されていない以上、fail-closed が守るものは何も無く、失うものだけがある。意図的な判断であり、`appLockStore.resolveInitialStatus` のコメントにも残している。

### 4.3 ゲートの実装

`AppShell` は「MantineProvider + `html[data-mobile-env]` + ロックゲート」だけの薄いルートで、アプリ本体は `AppMain` に分離してある。

```
LOCKED  → <AppLockScreen />
それ以外 → <AppMain />
```

**ロック中は `AppMain` をマウントしない**（条件分岐で個別に副作用を止めるのではなく、ツリーごと存在させない）。React は未マウントのコンポーネントの effect を走らせないので、これにより以下が認証前に走らないことが構造的に保証される:

- 起動時の document 自動生成
- `useBeforeUnloadGuard` の離脱警告
- `FileIOToolbar` による IndexedDB の一覧読み出し
- `ProgressBar` / `AlertHost` / `ToastHost`（直前操作のトーストに文書タイトルが載り得るため、ロック画面の裏に残さない）

`tests/components/appShellGate.test.tsx` がこの構造を回帰テストしている（LOCKED で描画したとき `useViewerDocumentStore.getState().meta` が `null` のままであることを検証）。

解錠時に `AppMain` は新規マウントされるため、ローカル state（ピッカーの開閉など）はリセットされる。store 由来の状態は保持される。

---

## 5. 失敗とリセット（抜け道を作らない）

| 状況 | 回復手段 |
|---|---|
| 生体認証の失敗 / credential 消失（パスキー削除、機種変更、サイトデータ消去） | **パスコードで解錠 → 設定から生体認証を再登録**。これがパスコードを必須にする理由 |
| WebAuthn 非対応環境（SNS の in-app browser、secure context 外） | パスコードのみ。UI から生体認証ボタンを隠す |
| `localStorage` ごと消えた | レコードが無い = ロック無効。そのまま開く（fail-open） |
| パスコードを忘れた | **「全データを消去してロック解除」のみ**。二段階確認。取り消し不可 |

- **URL バイパス（`?lock=reset` 等）は作らない。** それが唯一の本物の抜け道になる
- **「ロックだけ解除する」経路も作らない。** `disableLock` / `changePasscode` / `unregisterBiometrics` はすべて現行パスコードを要求する（`tests/hooks/useAppLock.test.tsx` の「バイパス防止」で回帰テスト済み）
- **リカバリコードは作らない。** 忘却しやすさが同じ第二のパスコードにすぎず、同じ端末にスクリーンショットで保存される
- 全消去がバイパスにならない理由: 攻撃者はデータを見たいのであって、消しても何も得られない。逆に**「N 回失敗で自動消去」にはしない**（端末を一時的に手にした他人による DoS ベクタになる）。ユーザーが明示的に選ぶ形にする
- 有効化フローで「パスコードを忘れると全ドキュメントを失う」と明示し、事前のバックアップ（HVD / PNG エクスポート）を促す

### 5.1 連続失敗（sensitive-mode-spec §9 の「将来拡張」への回答）

**指数バックオフのみ。ロックアウトも自動消去もしない。**

- `failureCount` はレコードに永続化する（リロードでリセットされない）
- 遅延は回数から純関数で算出する（`computeLockoutMs`、`0,0,0,1s,2s,4s,8s,15s,30s` で頭打ち）
- **待機の強制は in-memory のタイマで行い、絶対時刻を保存しない。** 端末時計の巻き戻しに依存させないため、かつ `toastStore` の「時刻に依存しない」方針に揃えるため。リロードすると現在の待機はスキップされるが、`failureCount` は残るので次の遅延は伸びる
- クールダウン中はパスコード照合そのものを行わない（PBKDF2 を回させない）
- **WebAuthn 経路の失敗は `failureCount` に数えない。** 生体認証のキャンセル・顔の認識漏れ・自動呼び出しの拒否（§7.3）は日常的に起きるため、これを混ぜるとパスコード入力が誤ってクールダウンで塞がれ、正当なユーザーが待たされる。生体認証の連続失敗は OS 側が既にレート制限している。実装では `noteFailure`（回数を増やす、パスコード用）と `noteSoftFailure`（理由だけ記録、WebAuthn 用）を分けている。**同じ理由で `registerBiometrics`（生体認証の登録）の失敗も `noteSoftFailure`。** 過去に一度 `noteFailure` を誤って使っており、生体認証の登録をキャンセルしただけでパスコードの連続失敗カウントが永続レコードへ書き込まれ、後で正しいパスコードを入力しても待たされる不具合があった（回帰テスト: `tests/hooks/useAppLock.test.tsx`「登録の失敗を繰り返してもパスコードの失敗回数は増えない」）
- **パスコードを検証する経路はすべて `throttled()` を通す。** `unlockWithPasscode` だけでなく `verifyCurrentPasscode` / `disableLock` / `unregisterBiometrics` / `changePasscode` も同じガードを通る。`verifyCurrentPasscode`（設定モーダルの「パスコードを変更」フローの現行パスコード確認）だけ一時的にこれを欠いていたことがあり、解錠済みの端末を一時的に借りた第三者が変更フローからクールダウン無しで総当たりし、成功したら新しいパスコードに差し替えて正規の持ち主を締め出せる経路になっていた（回帰テスト: 同ファイル「verifyCurrentPasscode の誤答も他の照合経路と同じくカウントされ、クールダウンが働く」）

**正直な限界**: 攻撃者は `localStorage` をクリアしてカウンタをリセットできる。ただしそれをするとレコードごと消えるので fail-open でロックが無効になる。つまりバックオフは UX レベルの抑止であってセキュリティ制御ではない。

---

## 6. 再ロック / 解錠セッション

再ロックの挙動は `src/state/appLockStore.ts` の `SESSION_TIMEOUT_MS` (ms) 1 つで決まる。**現在の既定値は `0`。**

| 値 | 挙動 |
|---|---|
| `0`（既定） | **猶予なし即ロック。** バックグラウンドへ回った瞬間にロックする |
| `> 0` | **セッション方式。** 最後の操作からその ms が経つとロックへ戻り、操作のたびに延長される。セッション中はバックグラウンドへ回して戻っても再認証を求めない |

実装は `src/hooks/useAppSession.ts`。解錠中（`UNLOCKED`）の間だけ購読し、`SESSION_TIMEOUT_MS` の値でどちらの分岐に入るかが決まる。両方の分岐がコードとして残っており、**定数を変えるだけで切り替えられる**。

### 6.0 なぜ両方残っているか（経緯）

当初は「即ロック（猶予なし）」で作った。通知センターを引いただけ・ファイルピッカーを開いただけで再認証が走る負担が大きいという指摘を受け、5 分の解錠セッション（猶予＋延長）に変更した。実機で試した結果、**この猶予（キャッシュ）は不要と判断し、`0` に戻した**。ただしセッション方式のコード自体は次に気が変わったときにすぐ戻せるよう、削除せず定数の分岐として残してある。

### 6.1 `SESSION_TIMEOUT_MS = 0`（即ロック、現在の既定）

延長・ポーリングの類は一切走らせない。`visibilitychange`（→ hidden）/ `pagehide` / `freeze` を直接購読し、検知した瞬間にロックする（ロック導入初期の `useAppRelock` と同じ挙動）。スライドショー再生中かどうかも問わない — 再生していても hidden になった瞬間にロックし、スライドショーは停止する。

### 6.2 `SESSION_TIMEOUT_MS > 0`（セッション方式）

ロックする契機は 2 つ:

| 契機 | 判定 |
|---|---|
| **表示中の無操作** | 10 秒間隔のポーリングで期限を監視する |
| **可視状態への復帰** | `visibilitychange`（→ visible）と `pageshow` で、その瞬間に期限を判定する |

2 つ必要な理由:

- バックグラウンドではタイマーが絞られる / 凍結されるため、ポーリングだけでは期限が来ても発火しない。復帰時に必ず判定する
- 逆に、端末を机に置いたまま前面に残っているケースはポーリングでしか拾えない

`hidden` へ遷移した時点ではロックしない（セッションを生かすため）。これが 0 (即ロック) との本質的な違い。

**操作とみなすイベント**: `pointerdown` / `keydown` / `wheel` / `touchstart` を capture + passive で購読する。延長は 1 秒間引き（連続入力のたびに store を書き換えない）。`lastActivityAt` はどのコンポーネントも購読していないので、更新しても再描画は起きない。

**スライドショー中の扱い**: 表示中に再生している間はセッションを延長する（ポーリングのたびに `touchSession`）。再生は無人で進むため操作イベントが発生せず、何もしないと再生開始から設定時間で必ずロックが落ちる（このアプリの主用途が壊れる）。「期限チェックを飛ばす」だけでは不十分 — `lastActivityAt` が古いまま残るので、再生を止めた直後の 1 回目のポーリングで期限切れと判定されて即ロックする。延長でなければならない。延長は「表示中」に限る（バックグラウンドでも延長すると、再生したまま伏せて放置した端末が永久に解錠されたままになる）。復帰時の期限判定は再生中でも例外にしない（バックグラウンドに長く置かれたなら再生中でもロックする）。

**セキュリティ上のトレードオフ**: 猶予がある分、バックグラウンドへ回した直後の設定時間はアプリが解錠されたままになる。この間に端末を他人が手に取れば中身が見える。§1 の脅威モデルに対する防御が、その時間ぶん弱くなる。

### 6.3 時刻の扱い（共通）

経過時間は `performance.now()`（単調増加）で測る。`Date.now()` を使うと**端末時計を巻き戻すことで「経過時間が負 = まだ有効」に見せられる**。

`lastActivityAt` は**永続化しない**（メモリのみ）。永続化するとリロードしただけでセッションが生き残り、「リロードで必ずロックへ戻る」保証（§3.1）が崩れる。

### 6.4 隠せないもの（共通）

iOS はバックグラウンド移行時にアプリスイッチャー用のスクリーンショットを撮るが、その撮影は `hidden` の発火や React の再描画より前になり得る。ネイティブの `applicationWillResignActive` 相当が Web には存在しないため、**原理的に防げない**。0 (即ロック) でも `hidden` イベント自体は撮影後に発火し得るので、この点は `SESSION_TIMEOUT_MS` の値に関わらず変わらない。

---

## 7. UI

### 7.1 ロック画面（`src/components/AppLockScreen.tsx`）

**Mantine の `Modal` は使わない。** Esc / backdrop クリック / `onClose` という「閉じる経路」が構造的に存在するため。`SlideshowShell` と同じ素の `position: fixed; inset: 0` オーバーレイにする。z-index は既存マップ（Modal ~200 / スライドショー 9999 / トースト 100000 / 進捗バー 100001）の最上位 100002。

- 表示するのは認証 UI だけ。**文書名・サムネイル等の中身は一切出さない**
- 生体認証ボタンは `credentialId` があり、かつ WebAuthn 対応環境のときだけ表示。§7.3 の自動呼び出しが拒否された環境でも解錠できるよう、ボタンは常に残す
- フィードバックは独自表示（`useAlert` を使わない）。`AlertHost` は `AppMain` 側なのでロック中は未マウント、かつ Modal は Esc で閉じられる
- WebAuthn のキャンセル / タイムアウト / 失敗はすべて `NotAllowedError` で返り区別できないため、「解錠できませんでした」という中立な文言にしてパスコード導線へ誘導する
- 最下部に「パスコードを忘れた場合」→ 全消去の手順を開示（二段階確認）

### 7.2 設定 UI（`src/components/panels/AppLockSettingsModal.tsx`）

スマホ（VIEW モード）で開ける汎用メニューは `FileIOSubMenu` の ⋮ しか無いため、そこに「アプリ > 画面ロック」を追加する。既に同じ理由で「スマホ限定のファイル操作」セクションが置かれている場所。

表示条件は `isMobileEnv`（ゲートと同一のソース）。PC で動作を確認する場合は、ウィンドウ幅を 900px 以下にすると `isMobileEnv()` が真になりメニュー項目が出る。

**「1 画面 1 入力」のステップ形式**にする。パスコード入力はロック画面と同じ 10 キー（§7.4、`tone="light"`）で行い、テキスト入力欄は一切置かない。1 画面に複数の入力欄を並べる形だとキーパッドを複数置くことになり成立しないため、フローを分解した。テンキーと TextField が混在する UI にはしない。

画面（`LockStep`）:

| 画面 | 内容 |
|---|---|
| `INTRO` | 未設定時の説明 + バックアップ警告（§5）→ 続ける |
| `MENU` | 設定済みのルート。生体認証の登録/解除、パスコード変更、ロック解除を選ぶ |
| `CURRENT` | 現行パスコードの入力 |
| `NEW` | 新しいパスコードの入力 |
| `CONFIRM` | 再入力（不一致なら `NEW` へ戻す） |
| `BIOMETRIC` | 有効化直後に生体認証の登録を勧める（`webauthnAvailable` のときだけ） |
| `DONE` | 完了表示 |

フロー（`LockIntent`）:

- **有効化**: `INTRO → NEW → CONFIRM →` 保存 `→ BIOMETRIC → DONE`
- **パスコード変更**: `MENU → CURRENT → NEW → CONFIRM → DONE`
- **無効化**: `MENU → CURRENT → DONE`
- **生体認証の解除**: `MENU → CURRENT → DONE`
- **生体認証の登録**: `MENU →` 即実行 `→ DONE`（パスコードを要求しない。解錠済み端末での追加登録であり、ロックを弱める操作ではない）

実装上の注意:

- **変更フローだけは現行パスコードを先に検証する**（`verifyCurrentPasscode`）。これが無いと、新しいパスコードを 2 回入力させた最後に「現行が違う」と突き返すことになる
- **無効化・生体解除では事前検証しない。** `disableLock` / `unregisterBiometrics` が内部で照合するので、事前検証と合わせると PBKDF2 が 150,000 回 × 2 で 1 秒近く待たせることになる
- `verifyCurrentPasscode` は状態を変えない。またこのモーダルに到達できるのは解錠済み or ロック未設定の状態だけなので、ロック画面のスロットリングを迂回する経路にはならない
- 開いた瞬間に初期画面へ戻す（前回の入力を持ち越さない）

### 7.3 生体認証の自動呼び出し（タップ数削減）

生体認証が登録済みなら、ロック画面で自動的に `credentials.get()` を試す。ボタンを押す手間を省くため。

**プラットフォームに「アプリ起動」フックは存在しない**（`launchQueue` は Chromium 限定で起動パラメータを渡すだけ、`DOMContentLoaded` や SW の activate も代わりにならない）。このアプリでの実質的な起動時は `AppLockScreen` のマウントであり、`AppShell` が `AppMain` と入れ替える構造なので**起動時とバックグラウンド復帰時の両方でマウントされる**。

ただし**トリガは「マウント」ではなく「可視になったこと」**にする。再ロックは `hidden` で発火するため、ロック画面はまだ非表示のうちにマウントされる。その時点で WebAuthn を呼んでも必ず失敗し、戻ってきた時には再試行されないので、**一番使う復帰シナリオで効かなくなる**。実装は「マウント時に可視なら即試行、非表示なら `visibilitychange` で可視になった時に試行」。

- **ロック 1 サイクルにつき 1 回だけ試す。** `AppLockScreen` はロックごとに再マウントされるので `useRef` で足りる
- **失敗しても静かにボタン表示へフォールバックする。** Safari は `credentials.get()` に transient user activation を要求するため、ユーザー操作なしの呼び出しが `NotAllowedError` で拒否される環境がある。そこでエラー文を出すと、起動するたび身に覚えのない警告が出ることになる（`unlockWithBiometrics({ silent: true })`）
- 自動呼び出しの失敗は `failureCount` も `lastFailure` も変更しない（§5.1）

**自動呼び出しが実際に成功するかは環境依存**で、拒否されても UX は「ボタンを押す」に戻るだけなので、対応環境では得をし、非対応環境では損をしない設計になっている。

### 7.4 パスコード入力は自作 10 キー（`src/components/common/PasscodeKeypad.tsx`）

ロック画面のパスコード入力に `TextInput` / `PasswordInput` を使わない。理由:

- iOS でソフトキーボードが立ち上がると、ロック画面の下半分が隠れて解錠ボタンに届かなくなる
- キーボードの出入りで `100dvh` が揺れ、オーバーレイのレイアウトが動く
- 数字だけ受け付けたいのに、予測変換やペーストで想定外の文字が入り得る

自前のキーパッドなら入力経路が数字 10 個 + 削除に限定され、レイアウトも固定できる。

- 見た目は iOS のロック画面風（ドット表示 + 円形キーの 3×4 グリッド、左下は空で 0 を中央）
- **桁数に達した時点で自動照合する**（iOS と同じ）。そのため解錠ボタンは出さない
  - パスコードは 4〜32 桁の可変長なので、正解の桁数を知らないと自動照合できない。**桁数はレコードに保存する**（`passcodeLength`、§3.1）
  - 検証子から桁数は算出できない。暗号文の長さは sentinel 平文の長さで決まり（AES-GCM: 平文長 + 16 byte タグ）、PBKDF2 の出力も入力長に依存しないため。平文も検証用ハッシュも持たない設計（§3.2）の帰結
  - 代替案として「下限桁数以降、1 打鍵ごとに照合を試す」も可能だが、**打鍵ごとに PBKDF2 150,000 回（数百 ms）が走る**ため採らない
  - `passcodeLength` を持たない古いレコードでは自動照合せず、明示的な解錠ボタンを出す。**初回の解錠成功時に実際の桁数を書き戻す**（これが無いと、既に有効化済みの端末では自動照合が永久に働かない）
  - 桁数の秘匿性: 漏れると総当たりの範囲が狭まるが、このレコードを読める攻撃者は同一オリジンの IndexedDB（平文文書）も読めるため実害はない（§1）
- ドットは桁数が分かればその数だけ固定表示し（残り何桁か見える）、不明なら下限個数から入力ぶんだけ増える。値そのものは一切表示しない
- **照合に失敗したら入力をクリアする**（打ち直しの起点を揃える。iOS と同じ）。失敗後も解錠ボタンは出さず、自動照合だけで完結させる
- **キー入力は `expectedLength` では打ち止めない**（上限は `maxLength` のみ）。`passcodeLength` には有効化・変更・解錠成功のいずれでも実際の値しか書かないため食い違いは起こらないが、`localStorage` を手で書き換えられた場合にキーまで塞ぐと打ち直しの余地がなくなる。その状況の復帰手段は §5 の全消去
- **同じ入力値を 2 回照合しない。** `busy` の立ち下がりで effect が再走するため、ガードが無いと解錠成功後も照合が繰り返される（親が画面を unmount するまで）。親任せにせず自前で止める
- **キーサイズは CSS 変数 + `max-height` のメディアクエリで縮む。** manifest が `orientation: landscape` なのでスマホでは viewport の高さが 400px 前後しかなく、固定 76px（4 行 = 349px）だとタイトルや解錠ボタンが画面外へ押し出される。加えてオーバーレイ側を `overflowY: auto` にして、縮めても入り切らない端末で操作不能にならないようにしている
  - 段は 76px / 59px（`max-height:560px`）/ 48px（`max-height:440px`）。一番狭い段でも 48px を割らない（タップ精度の推奨下限 44〜48px）
- **オーバーレイ内では下寄せで配置する**（`align-items: flex-end` + `padding-bottom: clamp(8px, 5vh, 40px)`）。中央寄せだとキーパッドが画面上半分に食い込み、端末を持った手の親指が届かない
- **入力は `value` を閉じ込めずに ref 経由で積む。** 連続入力（高速タイプ、素早い連続タップ）は同一の React バッチにまとまるため、`value` を直接読むと 2 回目以降が古い値を見て桁が落ちる
- 物理キーボード（数字 / Backspace / Enter）も受け付ける。PC でも幅 900px 以下ならロック画面が出るため、キーパッドしか無いと 1 桁ずつクリックすることになる。判定は `e.key`（`e.code` の物理位置では JIS 配列に合わない）

**配色は `tone` で切り替える**（`PasscodeKeypadTone.DARK` / `LIGHT`）。ロック画面は暗いオーバーレイ、設定モーダルは Mantine の白背景なので、色を CSS 変数（`--pk-fg` / `--pk-bg` / `--pk-bg-active` / `--pk-dot-bd`）に寄せて両方で使えるようにしてある。設定モーダルも同じキーパッドを使う（§7.2）— テンキーと TextField が混在する UI にはしない。

---

## 8. WebAuthn の実装方針

`src/utils/webauthnLock.ts`。この層は throw せず、すべて `{status:"ok"|"failed"}` の Result 型で返す（`tsconfig` が `strict:false` のため boolean 判別子ではナローイングが効かない。既存の `useStorage.ts` の `LoadResult` と同形）。

### 8.1 登録 `credentials.create()`

- `rp: { name: "Viewer" }` — **`rp.id` を書かない**（現オリジンから導出させる）。ハードコードすると `localhost` 開発時に `SecurityError` で必ず落ちる
- `user.id` は 16 byte random。`name` / `displayName` に PII を入れない（プロンプトや OS の設定画面に出る）
- `authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "discouraged", userVerification: "required" }`
  - `discouraged` にするのは、credential ID を自前で保存するので discoverable である必要がなく、discoverable にすると iCloud Keychain のパスキー一覧に常駐して UI が増えるだけだから
- `attestation: "none"`（検証するサーバが無い）
- `excludeCredentials` に既存 ID を入れて 1 インストール 1 credential を維持する（**アプリ側から credential を削除する API は WebAuthn に存在しない**ため、増殖させると OS の設定画面に登録が溜まる）
- 保存するのは `rawId` の base64 のみ。公開鍵は検証しないので保存しない

### 8.2 解錠 `credentials.get()`

- `allowCredentials` に保存済み ID を `transports: ["internal"]` で渡す
- 成功判定は「Promise が resolve」+「`rawId` が保存済み ID とバイト一致」
- `authenticatorData` の UV ビットも読むが、これは**セキュリティ検証ではない**（クライアント側の値なので改変できる）。プラットフォームが `userVerification:"required"` を黙って downgrade していないかの挙動アサーションとして使う
- 署名は検証も保存もしない（§1.2）

### 8.3 実装上の制約

- **同時に 1 リクエストのみ。** 未解決の `create`/`get` がある状態で 2 回目を呼ぶと `InvalidStateError` になるため in-flight ガードを持つ
- **`instanceof PublicKeyCredential` を使わない。** テストのモックがインスタンスにならないため、duck typing で `rawId` の有無を見る
- feature detection では `window.isSecureContext` を必ず見る。`npm run dev` を LAN IP（`http://192.168.x.x`）でスマホから開くと WebAuthn も `crypto.subtle` も使えず、**パスコード登録すら失敗する**

### 8.4 RP ID の評価

配信先が `https://harogen-net.github.io/viewer/` なので RP ID は `harogen-net.github.io` になる。WebAuthn にパススコープは存在しないため、`/viewer/` に限定できない。

- **他ユーザーからは隔離される** — `github.io` は Public Suffix List に載っているので `someoneelse.github.io` はこの RP ID を名乗れない
- **同一アカウントの他 Pages プロジェクトとは共有される** — ただしそれらは同一オリジンなので**元から IndexedDB の平文文書を全部読めている**。ロックが追加した攻撃面はゼロ
- 将来、同アカウントに untrusted なコードを置く予定ができたらカスタムドメイン（CNAME）へ分離する。現時点では不要

---

## 9. 実装ファイル

| パス | 責務 |
|---|---|
| `src/types/AppLock.ts` | `AppLockStatus` / `LockFailure` / `AppLockRecord` |
| `src/utils/appLockPasscode.ts` | パスコード検証子の生成・照合、形式チェック |
| `src/utils/webauthnLock.ts` | WebAuthn の登録・解錠（DOM のみ、React 非依存） |
| `src/state/appLockStore.ts` | 状態 + localStorage 永続 + 純関数（`parseLockRecord` / `resolveInitialStatus` / `computeLockoutMs`） |
| `src/hooks/useAppLock.ts` | オーケストレーション（UI はこれだけを呼ぶ） |
| `src/hooks/useAppSession.ts` | 再ロックの管理。`SESSION_TIMEOUT_MS` の値で「即ロック」と「解錠セッション」を切り替える（§6） |
| `src/components/AppShell.tsx` | Provider + ゲートだけの薄いルート |
| `src/components/AppMain.tsx` | アプリ本体（旧 AppShell の中身） |
| `src/components/AppLockScreen.tsx` | ロック画面 |
| `src/components/panels/AppLockSettingsModal.tsx` | 設定 UI |
| `src/utils/sensitiveCrypto.ts` | `encryptJson` / `decryptJson` / base64 helper を追加、`deriveKey` の iterations 修正 |
| `src/hooks/useStorage.ts` | `eraseAllDocuments()` を追加（`canEditNow` gate を掛けない。スマホは常に VIEW モードなので、掛けるとロックアウト時にリセットできない） |

---

## 10. 実機検証が必要な項目（未実施）

以下は Web 標準の記述からは確定できず、**実機で確認するまで設計が確定しない**。バージョン番号は断定していない。

1. **ホーム画面 standalone と Safari タブで `localStorage` / credential が共有されるか** ← 最優先。分離される場合、「Safari タブでロックを有効化 → ホーム画面から起動すると `localStorage` が空 → ロック無しで開く」が起きる。fail-open 設計なので壊れはしないが、「必ずホーム画面に追加してから設定してください」という UX 誘導が必要になる
2. **standalone PWA で `credentials.create()` / `get()` が実際に動くか** — 過去にバグ報告があった領域
3. **`display: "fullscreen"`（vite.config.js）で iOS が実際にインストールできるか、どの display モードになるか** — iOS は `fullscreen` を manifest display としてサポートしていない。ただし認証コアは display モードに依存する分岐を持たないので、結果が何であれ同じコードパスが動く
4. **`credentials.get()` の user activation 要件** — `useEffect` から呼べないことの確認
5. **ターゲット端末での PBKDF2 150,000 回の実測時間** — 500ms を超えるなら UI にスピナーを出す（値は下げない）
6. **SNS の in-app browser で WebAuthn が使えないこと** = パスコード経路のみになることの確認
7. **iOS の 7 日間ストレージ削除ポリシーがインストール済み web app に適用されるか**（ロックが勝手に消えるか）

検証は secure context が必要なため、gh-pages 等の https 配信で行う。ローカルの `npm run dev` を LAN IP で開いても検証できない（§8.3）。
