import { PasscodeKeypad } from "@/components/common/PasscodeKeypad";
import { useAppLock } from "@/hooks/useAppLock";
import { useAppLockStore } from "@/state/appLockStore";
import { AppLockStatus, LockFailure } from "@/types/AppLock";
import { PASSCODE_MAX_LENGTH, PASSCODE_MIN_LENGTH } from "@/utils/appLockPasscode";
import { isWebAuthnSupported } from "@/utils/webauthnLock";
import { Anchor, Button, Collapse, Stack, Text } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useEffect, useRef, useState } from "react";

// アプリロックの全画面オーバーレイ。認証が通るまでアプリ本体 (AppMain) は描画されない。
//
// Mantine Modal は使わない: Esc / backdrop クリック / onClose という「閉じる経路」が構造的に
// 存在するため。SlideshowShell と同じ素の position:fixed オーバーレイにする。
//
// 表示するのは認証 UI だけ。文書名・サムネイル等の中身は一切出さない
// (ロック画面越しに情報が漏れては意味がない)。

// z-index マップ: モーダル (~200) / スライドショー (9999) / トースト (100000) /
// 進捗バー (100001) より上。ロック中は AppMain 未マウントなので競合相手はいないが、
// Portal の残骸に対しても無条件で勝つようにしておく。
const Z_INDEX = 100002;

/** この回数以上失敗したら、復旧導線への案内を自分から出す。 */
const RECOVERY_HINT_AFTER_FAILURES = 3;

const overlayStyle: CSSProperties = {
	position: "fixed",
	inset: 0,
	zIndex: Z_INDEX,
	background: "#111",
	// 縦スクロールを許す。manifest が orientation:landscape なのでスマホでは viewport の高さが
	// 400px 前後しかなく、キーパッド + ボタン + 復旧導線が入り切らない場合がある。overflow:hidden
	// だと解錠ボタンが画面外に出て押せなくなる (キーパッド自体も高さで縮むが、それでも足りない
	// 端末があり得る)。
	overflowY: "auto",
	// iOS のノッチ / ホームインジケータを避ける。
	padding:
		"env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)",
};

// スクロール可能な親の中で中央寄せする。overflow:auto の親に align-items:center を直接付けると
// 内容が親より高いときに上端が切れて届かなくなるため、min-height:100% のラッパーを挟む。
const centerWrapStyle: CSSProperties = {
	minHeight: "100%",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
};

const panelStyle: CSSProperties = {
	width: "min(360px, 90vw)",
	padding: 16,
};

// 失敗理由 → 表示メッセージ。WebAuthn のキャンセル / タイムアウト / 失敗はすべて
// NotAllowedError で返り区別できないため、中立な文言にしてパスコード導線へ誘導する。
//
// 待機中は必ず残り秒数を出す。ここを黙らせたり 0 秒のまま固まらせると、ユーザーには
// 「正しいパスコードなのに反応しない」としか見えない。
const failureMessage = (
	reason: LockFailure | null,
	cooldownLeft: number,
	failureCount: number
): string | null => {
	if (reason === null) return null;
	switch (reason) {
		case LockFailure.WRONG_PASSCODE:
			return failureCount > 1
				? `パスコードが違います (${failureCount} 回連続)。`
				: "パスコードが違います。";
		case LockFailure.THROTTLED:
			return cooldownLeft > 0
				? `連続で失敗したため待機中です。あと ${Math.ceil(cooldownLeft / 1000)} 秒お待ちください。`
				: "もう一度入力してください。";
		case LockFailure.WEBAUTHN_UNSUPPORTED:
			return "この環境では生体認証を利用できません。パスコードで解錠してください。";
		case LockFailure.WEBAUTHN_NO_CREDENTIAL:
			return "生体認証が登録されていません。パスコードで解錠してください。";
		case LockFailure.IN_FLIGHT:
			return "認証を処理中です。";
		default:
			return "解錠できませんでした。パスコードで解錠してください。";
	}
};

export const AppLockScreen: FC = () => {
	const lock = useAppLock();
	const record = useAppLockStore((s) => s.record);
	const failureCount = useAppLockStore((s) => s.failureCount);
	const lastFailure = useAppLockStore((s) => s.lastFailure);
	const busy = useAppLockStore((s) => s.busy);
	const [passcode, setPasscode] = useState("");
	const [showRecovery, setShowRecovery] = useState(false);
	const [erasing, setErasing] = useState(false);

	// クールダウンの残り時間は store の明け時刻 (lockoutUntil) から算出する。
	// failureCount から再計算すると、永続化された回数のせいで「待機が永久に明けない」状態を
	// 表示してしまう (照合側と同じ恒久ロックアウトの罠)。
	const lockoutUntil = useAppLockStore((s) => s.lockoutUntil);
	const [cooldownLeft, setCooldownLeft] = useState(0);
	useEffect(() => {
		const remaining = (): number => Math.max(0, lockoutUntil - performance.now());
		const left = remaining();
		setCooldownLeft(left);
		if (left <= 0) return;
		const id = window.setInterval(() => {
			const next = remaining();
			setCooldownLeft(next);
			if (next <= 0) window.clearInterval(id);
		}, 250);
		return () => window.clearInterval(id);
	}, [lockoutUntil]);

	const throttled = cooldownLeft > 0;
	const canUseBiometrics = !!record?.credentialId && isWebAuthnSupported();
	const message = failureMessage(lastFailure, cooldownLeft, failureCount);

	// 生体認証の自動呼び出し (タップ数を減らすため)。
	//
	// トリガは「マウント」ではなく「可視になったこと」。再ロックは hidden で発火するので、
	// ロック画面は非表示のうちにマウントされる。その時点で WebAuthn を呼んでも必ず失敗し、
	// 戻ってきた時には再試行されない = 一番使う復帰シナリオで効かなくなる。
	//
	// ロック 1 サイクルにつき 1 回だけ試す (AppLockScreen はロックごとに再マウントされるので
	// ref で足りる)。失敗しても静かにボタン表示へフォールバックする: Safari は
	// credentials.get() に transient user activation を要求するため、ユーザー操作なしの
	// 呼び出しが NotAllowedError で拒否される環境がある。そこでエラー文を出すと、起動するたび
	// 身に覚えのない警告が出ることになる。
	const autoTriedRef = useRef(false);
	useEffect(() => {
		if (!canUseBiometrics) return;
		const tryAuto = (): void => {
			if (autoTriedRef.current) return;
			if (document.visibilityState !== "visible") return;
			autoTriedRef.current = true;
			void lock.unlockWithBiometrics({ silent: true });
		};
		tryAuto();
		document.addEventListener("visibilitychange", tryAuto);
		return () => document.removeEventListener("visibilitychange", tryAuto);
	}, [canUseBiometrics, lock]);

	// 正解の桁数が分かっていれば、その桁数に達した時点で自動照合する (iOS のロック画面と同じ)。
	// 桁数を持たない旧レコードでは undefined になり、送信ボタンで照合する。
	const expectedLength = record?.passcodeLength;

	// 下限桁数に達していない入力は照合しない (PBKDF2 を無駄に回さず、失敗回数も増やさない)。
	const canSubmit = passcode.length >= PASSCODE_MIN_LENGTH && !busy && !throttled;

	// 失敗したら入力をクリアして打ち直しの起点を揃える (iOS のロック画面と同じ)。
	const submitPasscode = async (): Promise<boolean> => {
		if (!canSubmit) return false;
		const ok = await lock.unlockWithPasscode(passcode);
		if (!ok) setPasscode("");
		return ok;
	};

	// 桁数到達で自動照合。
	//
	// 同じ入力値に対して 2 回照合しない (autoSubmittedRef)。これが無いと、busy の立ち下がりで
	// effect が再走したときに同じ値をもう一度照合してしまう — 解錠に成功しても passcode は
	// 残っているため、親が画面を unmount するまで照合が繰り返される。親任せにせず自前で止める。
	// 入力が桁数を下回ったら (失敗後のクリアや削除キー) ガードを解いて再入力を受け付ける。
	const autoSubmittedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!expectedLength) return;
		if (passcode.length < expectedLength) {
			autoSubmittedRef.current = null;
			return;
		}
		if (passcode.length !== expectedLength) return;
		if (busy || throttled) return;
		if (autoSubmittedRef.current === passcode) return;
		if (useAppLockStore.getState().status !== AppLockStatus.LOCKED) return;
		autoSubmittedRef.current = passcode;
		void submitPasscode();
		// submitPasscode は passcode/busy/throttled から導出されるので依存に入れない。
		// biome-ignore lint/correctness/useExhaustiveDependencies: 入力長の変化で 1 回だけ走らせる
	}, [passcode, expectedLength, busy, throttled]);

	return (
		<div style={overlayStyle} data-app-lock>
			<div style={centerWrapStyle}>
				<Stack gap="md" style={panelStyle}>
					{/* <Text c="#fff" fw={600} size="lg">
						ロック中
					</Text> */}
					<Text c="#fff" ta="center" size="sm">
						パスコードを入力
					</Text>

					{/* 待機中は常時表示する。エラー文が別の理由で上書きされても「今は受け付けない
					    状態」だと分かるようにする。ここを黙らせると、正しいパスコードを打っても
					    反応しないアプリに見える。 */}
					{throttled && (
						<Text bg="yellow.7" c="white" size="sm" ta="center" data-app-lock-cooldown>
							待機中: あと {Math.ceil(cooldownLeft / 1000)} 秒
						</Text>
					)}

					{message && (
						<Text bg="red.5" c="white" size="sm" ta="center" data-app-lock-error>
							{message}
						</Text>
					)}

					{/* 失敗が続いたら復旧導線への案内を自分から出す。黙っていると打つ手が無くなる。 */}
					{failureCount >= RECOVERY_HINT_AFTER_FAILURES && !showRecovery && (
						<Text c="dimmed" size="xs" ta="center" data-app-lock-recovery-hint>
							解錠できない場合は下の「パスコードを忘れた場合」を開いてください。
						</Text>
					)}

					{canUseBiometrics && (
						// 自動呼び出し (上記 useEffect) が拒否された環境でも解錠できるよう、ボタンは常に残す。
						// ユーザー操作起点なので Safari の user activation 要件を確実に満たす。
						<Button
							variant="light"
							disabled={busy}
							onClick={() => void lock.unlockWithBiometrics()}
							data-app-lock-biometric>
							生体認証で解錠
						</Button>
					)}

					{/* パスコードは自作 10 キーで入力する (TextField を使わない理由は PasscodeKeypad 参照)。 */}
					<PasscodeKeypad
						value={passcode}
						onChange={setPasscode}
						onSubmit={() => void submitPasscode()}
						disabled={busy || throttled}
						minLength={PASSCODE_MIN_LENGTH}
						maxLength={PASSCODE_MAX_LENGTH}
						expectedLength={expectedLength}
					/>
					{/* 桁数が分かっているときは到達時に自動照合するので、送信ボタンは出さない
					    (iOS のロック画面と同じ)。失敗後も出さない。桁数不明な旧レコードのときだけ出す。 */}
					{!expectedLength && (
						<Button
							disabled={!canSubmit}
							onClick={() => void submitPasscode()}
							data-app-lock-submit>
							解錠
						</Button>
					)}

					<Anchor
						component="button"
						type="button"
						size="xs"
						c="dimmed"
						onClick={() => setShowRecovery((v) => !v)}
						data-app-lock-recovery-toggle>
						パスコードを忘れた場合
					</Anchor>
					<Collapse in={showRecovery}>
						<Stack gap="xs">
							{/* TEMP (要 revert): 正しいはずのパスコードで解錠できない事象の切り分け中。
							    本来の「全データ消去」導線を一時的に「認証情報のクリア (ドキュメントは
							    消さない)」に差し替えている。原因判明後は下のコメントアウトを外し、
							    この TEMP ブロックを削除して元に戻すこと。 */}
							{/* 元のコード (revert 時にコメントアウトを外す):
							<Text c="dimmed" size="xs">
								パスコードを復元する手段はありません。解錠できない場合は、この端末に保存された
								ドキュメントをすべて消去してロックを解除するしかありません。取り消しできません。
							</Text>
							<Button
								color="red"
								variant="outline"
								size="xs"
								disabled={busy}
								onClick={() => setErasing(true)}
								data-app-lock-erase>
								全データを消去してロック解除
							</Button>
							<Collapse in={erasing}>
								<Stack gap="xs">
									<Text c="red.5" size="xs">
										本当に消去しますか? この端末のドキュメントがすべて失われます。
									</Text>
									<Button
										color="red"
										size="xs"
										disabled={busy}
										onClick={() => void lock.eraseAllAndDisable()}
										data-app-lock-erase-confirm>
										消去する
									</Button>
									<Button variant="subtle" size="xs" onClick={() => setErasing(false)}>
										やめる
									</Button>
								</Stack>
							</Collapse>
							*/}

							{/* TEMP: 認証情報クリア版 */}
							<Text c="dimmed" size="xs">
								[一時措置] 解錠できない場合、下のボタンで認証情報 (パスコード / 生体認証の登録)
								だけをクリアしてロックを無効化できます。ドキュメントは消えません。
							</Text>
							<Button
								color="red"
								variant="outline"
								size="xs"
								disabled={busy}
								onClick={() => setErasing(true)}
								data-app-lock-erase>
								認証情報をクリアしてロック解除 (一時措置)
							</Button>
							<Collapse in={erasing}>
								<Stack gap="xs">
									<Text c="red.5" size="xs">
										認証情報をクリアしますか? ドキュメントは失われません。
									</Text>
									<Button
										color="red"
										size="xs"
										disabled={busy}
										onClick={() => lock.clearAuthOnly_TEMP()}
										data-app-lock-erase-confirm>
										クリアする
									</Button>
									<Button variant="subtle" size="xs" onClick={() => setErasing(false)}>
										やめる
									</Button>
								</Stack>
							</Collapse>
						</Stack>
					</Collapse>
				</Stack>
			</div>
		</div>
	);
};
