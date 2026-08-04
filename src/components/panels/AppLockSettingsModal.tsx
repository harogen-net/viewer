import { PasscodeKeypad, PasscodeKeypadTone } from "@/components/common/PasscodeKeypad";
import { useAppLock } from "@/hooks/useAppLock";
import { useAppLockStore } from "@/state/appLockStore";
import {
	isValidPasscodeFormat,
	PASSCODE_MAX_LENGTH,
	PASSCODE_MIN_LENGTH,
} from "@/utils/appLockPasscode";
import { Alert, Button, Modal, Stack, Text } from "@mantine/core";
import type { FC } from "react";
import { useEffect, useRef, useState } from "react";

// アプリロックの設定モーダル。docs/app-lock-spec.md §7.2。
//
// 「1 画面 1 入力」のステップ形式にしてある。パスコード入力は全てロック画面と同じ 10 キー
// (PasscodeKeypad) で行い、テキスト入力欄は使わない。1 画面に 5 つの入力欄を並べる形だと
// キーパッドを 5 つ置くことになり成立しないため、フローを分解した。
//
// 開閉は呼び出し側の local state (SlideshowSettingsModal と同方針、store 化しない)。
// 到達導線は FileIOSubMenu の ⋮ メニュー — スマホで開ける汎用メニューがそこにしか無い。
// 設定は端末ローカル (localStorage + 端末に紐付く WebAuthn credential) なので、PC で登録しても
// スマホには何の効果もない。そのためメニュー項目自体をスマホ限定にしてある。

/** 表示中の画面。文字列 union ではなく const オブジェクト + 派生型。 */
const LockStep = {
	/** 設定済みのルート (操作を選ぶ)。 */
	MENU: "menu",
	/** 未設定の説明 + バックアップ警告。 */
	INTRO: "intro",
	/** 現行パスコードの確認 (変更 / 無効化 / 生体解除の前段)。 */
	CURRENT: "current",
	/** 新しいパスコードの入力。 */
	NEW: "new",
	/** 新しいパスコードの再入力。 */
	CONFIRM: "confirm",
	/** 生体認証を登録するかの確認 (有効化の直後)。 */
	BIOMETRIC: "biometric",
	/** 完了表示。 */
	DONE: "done",
} as const;
type LockStep = (typeof LockStep)[keyof typeof LockStep];

/** 現行パスコードを何のために聞いているか。 */
const LockIntent = {
	ENABLE: "enable",
	CHANGE: "change",
	DISABLE: "disable",
	UNREGISTER_BIO: "unregisterBio",
} as const;
type LockIntent = (typeof LockIntent)[keyof typeof LockIntent];

const PASSCODE_HINT = `${PASSCODE_MIN_LENGTH}〜${PASSCODE_MAX_LENGTH} 桁の数字`;

const DONE_MESSAGE: Record<LockIntent, string> = {
	[LockIntent.ENABLE]: "画面ロックを有効にしました。",
	[LockIntent.CHANGE]: "パスコードを変更しました。",
	[LockIntent.DISABLE]: "画面ロックを解除しました。",
	[LockIntent.UNREGISTER_BIO]: "生体認証の登録を解除しました。",
};

interface AppLockSettingsModalProps {
	opened: boolean;
	onClose: () => void;
}

export const AppLockSettingsModal: FC<AppLockSettingsModalProps> = ({ opened, onClose }) => {
	const lock = useAppLock();
	const record = useAppLockStore((s) => s.record);
	const webauthnAvailable = useAppLockStore((s) => s.webauthnAvailable);
	const busy = useAppLockStore((s) => s.busy);

	const enabled = record !== null;
	const hasCredential = !!record?.credentialId;

	const [step, setStep] = useState<LockStep>(LockStep.MENU);
	const [intent, setIntent] = useState<LockIntent>(LockIntent.ENABLE);
	/** 現在の画面で打っている値。 */
	const [entry, setEntry] = useState("");
	/** NEW で確定した値 (CONFIRM と突き合わせる)。 */
	const [pendingPasscode, setPendingPasscode] = useState("");
	/** CURRENT で検証済みの現行パスコード。 */
	const [currentPasscode, setCurrentPasscode] = useState("");
	const [error, setError] = useState<string | null>(null);

	// 開くたびに初期画面へ戻す (前回の入力を持ち越さない)。
	useEffect(() => {
		if (!opened) return;
		setStep(enabled ? LockStep.MENU : LockStep.INTRO);
		setIntent(enabled ? LockIntent.CHANGE : LockIntent.ENABLE);
		setEntry("");
		setPendingPasscode("");
		setCurrentPasscode("");
		setError(null);
		// opened の立ち上がりだけで判定する (enabled が途中で変わっても画面を巻き戻さない)。
		// biome-ignore lint/correctness/useExhaustiveDependencies: 開いた瞬間のみ初期化
	}, [opened]);

	const goto = (next: LockStep): void => {
		setEntry("");
		setError(null);
		setStep(next);
	};

	// 生体認証の「登録」だけはパスコードを要求しない (解錠済みの端末での追加登録なので、
	// ロックを弱める操作ではない)。解除・変更・無効化は現行パスコードを通す。
	const begin = (next: LockIntent): void => {
		setIntent(next);
		goto(LockStep.CURRENT);
	};

	const wrongPasscode = (): void => {
		setError("パスコードが違います。");
		setEntry("");
	};

	const submitCurrent = async (): Promise<void> => {
		// disableLock / unregisterBiometrics は内部で照合するので、事前検証と二重に PBKDF2 を
		// 回さないよう直接呼ぶ (150,000 回 × 2 で 1 秒近く待たせることになる)。
		// 変更フローだけは先に検証する — 新しいパスコードを 2 回入力させた最後に「現行が違う」と
		// 突き返すのを避けるため。
		if (intent === LockIntent.CHANGE) {
			if (!(await lock.verifyCurrentPasscode(entry))) return wrongPasscode();
			setCurrentPasscode(entry);
			goto(LockStep.NEW);
			return;
		}
		if (intent === LockIntent.DISABLE) {
			if (await lock.disableLock(entry)) goto(LockStep.DONE);
			else wrongPasscode();
			return;
		}
		if (intent === LockIntent.UNREGISTER_BIO) {
			if (await lock.unregisterBiometrics(entry)) goto(LockStep.DONE);
			else wrongPasscode();
		}
	};

	const submitNew = (): void => {
		if (!isValidPasscodeFormat(entry)) {
			setError(`パスコードは ${PASSCODE_HINT} で入力してください。`);
			return;
		}
		setPendingPasscode(entry);
		goto(LockStep.CONFIRM);
	};

	const submitConfirm = async (): Promise<void> => {
		if (entry !== pendingPasscode) {
			setError("2 回目のパスコードが一致しません。もう一度入力してください。");
			setPendingPasscode("");
			setEntry("");
			setStep(LockStep.NEW);
			return;
		}
		if (intent === LockIntent.ENABLE) {
			if (!(await lock.enableLock(pendingPasscode))) {
				setError("設定を保存できませんでした (ストレージが利用できません)。");
				return;
			}
			// 生体認証が使える端末なら続けて登録を勧める。
			goto(webauthnAvailable ? LockStep.BIOMETRIC : LockStep.DONE);
			return;
		}
		if (!(await lock.changePasscode(currentPasscode, pendingPasscode))) {
			setError("パスコードを変更できませんでした。");
			return;
		}
		goto(LockStep.DONE);
	};

	const registerBiometrics = async (): Promise<void> => {
		if (await lock.registerBiometrics()) goto(LockStep.DONE);
		else setError("生体認証を登録できませんでした。");
	};

	// 現行パスコードの照合だけは正解の桁数が分かっている。到達時に自動で進める
	// (ロック画面と同じ挙動)。新規入力はユーザーが桁数を決めるので自動化できない。
	const currentExpectedLength = record?.passcodeLength;
	const autoAdvance = step === LockStep.CURRENT ? currentExpectedLength : undefined;

	// 同じ入力値を 2 回照合しない (ロック画面と同じ理由。busy の立ち下がりで effect が再走する)。
	const autoSubmittedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!autoAdvance) {
			autoSubmittedRef.current = null;
			return;
		}
		if (entry.length < autoAdvance) {
			autoSubmittedRef.current = null;
			return;
		}
		if (entry.length !== autoAdvance || busy) return;
		if (autoSubmittedRef.current === entry) return;
		autoSubmittedRef.current = entry;
		void submitCurrent();
		// biome-ignore lint/correctness/useExhaustiveDependencies: 入力長の変化で 1 回だけ走らせる
	}, [entry, autoAdvance, busy]);

	// パスコード入力画面の共通部品。1 画面 1 入力を徹底する。
	const passcodeStep = (args: {
		title: string;
		description?: string;
		submitLabel: string;
		onSubmit: () => void;
		back?: LockStep;
		testId: string;
		expectedLength?: number;
	}) => (
		<Stack gap="sm" data-app-lock-step={args.testId}>
			<Text fw={600}>{args.title}</Text>
			{args.description && (
				<Text size="xs" c="dimmed">
					{args.description}
				</Text>
			)}
			<PasscodeKeypad
				value={entry}
				onChange={setEntry}
				onSubmit={args.onSubmit}
				disabled={busy}
				minLength={PASSCODE_MIN_LENGTH}
				maxLength={PASSCODE_MAX_LENGTH}
				expectedLength={args.expectedLength}
				tone={PasscodeKeypadTone.LIGHT}
			/>
			{/* 桁数到達で自動的に進む画面ではボタンを出さない。 */}
			{!args.expectedLength && (
				<Button
					disabled={busy || entry.length < PASSCODE_MIN_LENGTH}
					onClick={args.onSubmit}
					data-app-lock-step-submit>
					{args.submitLabel}
				</Button>
			)}
			{args.back && (
				<Button variant="subtle" size="xs" disabled={busy} onClick={() => goto(args.back)}>
					戻る
				</Button>
			)}
		</Stack>
	);

	const body = () => {
		switch (step) {
			case LockStep.INTRO:
				return (
					<Stack gap="sm" data-app-lock-step="intro">
						<Text size="xs" c="dimmed">
							スマートフォンでこのアプリを開いたときに、認証を求めます。PC では動作しません。
						</Text>
						<Alert color="yellow" data-app-lock-backup-warning>
							<Text size="xs">
								パスコードを忘れると解除できません。回復手段はこの端末のドキュメントを
								すべて消去することだけです。有効にする前に HVD / PNG
								でバックアップを取っておいてください。
							</Text>
						</Alert>
						<Button onClick={() => goto(LockStep.NEW)} data-app-lock-intro-next>
							続ける
						</Button>
					</Stack>
				);

			case LockStep.MENU:
				return (
					<Stack gap="sm" data-app-lock-step="menu">
						<Text size="sm" data-app-lock-state>
							ロック: 有効 / 生体認証: {hasCredential ? "登録済み" : "未登録"}
						</Text>
						{webauthnAvailable && !hasCredential && (
							<Button
								variant="light"
								disabled={busy}
								onClick={() => void registerBiometrics()}
								data-app-lock-register-bio>
								生体認証を登録する
							</Button>
						)}
						{hasCredential && (
							<Button
								variant="subtle"
								disabled={busy}
								onClick={() => begin(LockIntent.UNREGISTER_BIO)}
								data-app-lock-unregister-bio>
								生体認証の登録を解除
							</Button>
						)}
						<Button
							variant="default"
							disabled={busy}
							onClick={() => begin(LockIntent.CHANGE)}
							data-app-lock-change-passcode>
							パスコードを変更
						</Button>
						<Button
							color="red"
							variant="outline"
							disabled={busy}
							onClick={() => begin(LockIntent.DISABLE)}
							data-app-lock-disable>
							ロックを解除 (無効化)
						</Button>
					</Stack>
				);

			case LockStep.CURRENT:
				return passcodeStep({
					title: "現在のパスコード",
					description:
						intent === LockIntent.CHANGE
							? "変更するには現在のパスコードを入力してください。"
							: "この操作には現在のパスコードが必要です。",
					submitLabel: "次へ",
					onSubmit: () => void submitCurrent(),
					back: LockStep.MENU,
					testId: "current",
					expectedLength: currentExpectedLength,
				});

			case LockStep.NEW:
				return passcodeStep({
					title: intent === LockIntent.ENABLE ? "パスコードを設定" : "新しいパスコード",
					description: PASSCODE_HINT,
					submitLabel: "次へ",
					onSubmit: submitNew,
					back: enabled ? LockStep.MENU : LockStep.INTRO,
					testId: "new",
				});

			case LockStep.CONFIRM:
				return passcodeStep({
					title: "もう一度入力",
					description: "確認のため同じパスコードを入力してください。",
					submitLabel: intent === LockIntent.ENABLE ? "有効にする" : "変更する",
					onSubmit: () => void submitConfirm(),
					back: LockStep.NEW,
					testId: "confirm",
				});

			case LockStep.BIOMETRIC:
				return (
					<Stack gap="sm" data-app-lock-step="biometric">
						<Text fw={600}>生体認証を登録しますか</Text>
						<Text size="xs" c="dimmed">
							Face ID / 指紋で解錠できるようになります。あとから設定することもできます。
						</Text>
						<Button
							disabled={busy}
							onClick={() => void registerBiometrics()}
							data-app-lock-register-bio>
							登録する
						</Button>
						<Button
							variant="subtle"
							disabled={busy}
							onClick={() => goto(LockStep.DONE)}
							data-app-lock-skip-bio>
							あとで
						</Button>
					</Stack>
				);

			case LockStep.DONE:
				return (
					<Stack gap="sm" data-app-lock-step="done">
						<Text fw={600} data-app-lock-done-message>
							{DONE_MESSAGE[intent]}
						</Text>
						<Button onClick={onClose} data-app-lock-done-close>
							閉じる
						</Button>
					</Stack>
				);
		}
	};

	return (
		<Modal opened={opened} onClose={onClose} title="画面ロック" centered data-app-lock-settings>
			<Stack gap="md">
				{body()}
				{error && (
					<Text c="red" size="xs" data-app-lock-settings-error>
						{error}
					</Text>
				)}
			</Stack>
		</Modal>
	);
};
