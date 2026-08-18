import type { AppLockRecord } from "@/types/AppLock";
import { AppLockStatus, type LockFailure } from "@/types/AppLock";
import { isMobileEnv } from "@/utils/mobileDetect";
import { create } from "zustand";

// アプリロック (スマホ限定の起動ゲート) の状態。docs/app-lock-spec.md 準拠。
//
// センシティブ文書のパスワード (state/sensitiveSessionStore.ts) とは別軸の機能。共用しない:
// あちらは「起動時に無条件では聞かない」(docs/sensitive-mode-spec.md §1.5 の確定事項) の
// に対し、こちらは起動時に必ず聞くため、同じ値にすると既存方針を壊す。
//
// 永続化は localStorage を直接叩く (persist ミドルウェアは repo 全体で未使用。前例は
// components/panels/ImageLibraryPanel.tsx の imageLibrary.cols)。
// ただし status (解錠済みか) は決して永続化しない — リロードや SW の autoUpdate による
// 再読み込みで必ずロックに戻ることを保証するため。

/** localStorage のキー。 */
export const APP_LOCK_KEY = "appLock.v1";
/** レコード形式のバージョン。 */
export const APP_LOCK_RECORD_VERSION = 1;

/** 連続失敗時のクールダウン (ms)。index = failureCount。以降は末尾の値で頭打ち。 */
const LOCKOUT_STEPS_MS = [0, 0, 0, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

/**
 * 解錠セッションの有効時間 (ms)。docs/app-lock-spec.md §6。
 *
 * - 0: 猶予なし。バックグラウンドへ回った瞬間に即ロックする (useAppSession が延長/ポーリングの
 *   類を一切走らせず、直接の即ロックに切り替える)
 * - >0: セッション方式。最後の操作からこの ms が経つとロックへ戻り、操作のたびに延長される。
 *   セッション中はバックグラウンド復帰でも再認証を求めない
 *
 * 実機で試した結果、猶予 (キャッシュ) は不要と判断し 0 にしている。5 分の猶予に戻したい場合は
 * この値を戻すだけでよい (`5 * 60 * 1_000` のようにする。useAppSession 側の分岐はそのまま使える)。
 */
export const SESSION_TIMEOUT_MS = 0;

/**
 * セッションが切れたかを判定する純関数。
 *
 * 時刻は performance.now() (単調増加) を渡す。Date.now() を使うと端末時計を巻き戻すことで
 * 「経過時間が負 = まだ有効」に見せられてしまう。
 */
export const isSessionExpired = (
	lastActivityAt: number,
	now: number,
	timeoutMs: number = SESSION_TIMEOUT_MS
): boolean => now - lastActivityAt >= timeoutMs;

/**
 * localStorage の生文字列をレコードへ変換する純関数。
 * 壊れている / 形式が違う場合は null (= ロック無効) を返し、throw しない。
 */
export const parseLockRecord = (raw: string | null): AppLockRecord | null => {
	if (!raw) return null;
	try {
		const o = JSON.parse(raw) as Partial<AppLockRecord>;
		if (!o || typeof o !== "object") return null;
		if (o.version !== APP_LOCK_RECORD_VERSION) return null;
		if (!o.verifier || typeof o.verifier !== "object") return null;
		if (!o.verifier.security || typeof o.verifier.ciphertext !== "string") return null;
		if (typeof o.userHandle !== "string" || o.userHandle.length === 0) return null;
		return {
			version: o.version,
			verifier: o.verifier,
			userHandle: o.userHandle,
			// 解錠に必要なのは verifier だけ。それ以外の欠損・型崩れでレコードを丸ごと捨てると、
			// 解錠できる検証子を持っているのにロックが黙って無効化される (fail-open)。
			// 補える項目は既定値へ寄せ、レコードを生かす。
			credentialId: typeof o.credentialId === "string" ? o.credentialId : null,
			failureCount: typeof o.failureCount === "number" && o.failureCount > 0 ? o.failureCount : 0,
			// 桁数を持たない旧レコードは undefined のまま (自動照合せず、解錠成功時に補完する)。
			...(typeof o.passcodeLength === "number" && o.passcodeLength > 0
				? { passcodeLength: o.passcodeLength }
				: {}),
		};
	} catch {
		return null;
	}
};

/**
 * 起動時の状態を決める純関数。
 *
 * fail-open (レコードが無い / 壊れている → ロックしない) を明示的に選んでいる。
 * fail-closed にすると、レコードが飛んだユーザーは解錠不能になり全データ消去しか道が
 * なくなる。守っている対象 (IndexedDB の文書) は暗号化されていないので、fail-closed が
 * 守るものは何も無く、失うものだけがある。意図的な判断であることをここに残す。
 */
export const resolveInitialStatus = (
	record: AppLockRecord | null,
	mobile: boolean
): AppLockStatus => {
	if (!record) return AppLockStatus.DISABLED;
	if (!mobile) return AppLockStatus.DISABLED;
	return AppLockStatus.LOCKED;
};

/** 連続失敗回数からクールダウン (ms) を返す純関数。時刻に依存しない (決定的)。 */
export const computeLockoutMs = (failureCount: number): number => {
	if (failureCount <= 0) return 0;
	const i = Math.min(failureCount, LOCKOUT_STEPS_MS.length - 1);
	return LOCKOUT_STEPS_MS[i];
};

const readRecord = (): AppLockRecord | null => {
	try {
		return parseLockRecord(localStorage.getItem(APP_LOCK_KEY));
	} catch {
		return null;
	}
};

const writeRecord = (record: AppLockRecord): boolean => {
	try {
		localStorage.setItem(APP_LOCK_KEY, JSON.stringify(record));
		return true;
	} catch {
		// プライベートモード / quota 超過。呼出側は失敗として扱う (有効化できない)。
		return false;
	}
};

const clearRecord = (): void => {
	try {
		localStorage.removeItem(APP_LOCK_KEY);
	} catch {
		/* localStorage 不可でも致命的でない */
	}
};

interface AppLockStoreState {
	/** 現在の状態。モジュール初期化時に 1 回だけ確定する (launchModeStore と同方針)。 */
	status: AppLockStatus;
	/** 永続レコード (未設定は null)。設定 UI と解錠フローが参照する。 */
	record: AppLockRecord | null;
	/** 生体認証がこの端末で使えるか。非同期判定の結果を後から流し込む。 */
	webauthnAvailable: boolean;
	/** 連続失敗回数 (record.failureCount のミラー。UI のクールダウン表示に使う)。 */
	failureCount: number;
	/** 認証 / 登録の処理中。ボタンの二重押下防止。 */
	busy: boolean;
	/** 直近の失敗理由 (UI のメッセージ出し分け)。 */
	lastFailure: LockFailure | null;
	/**
	 * 最後の操作時刻 (performance.now())。解錠セッションの期限判定に使う。
	 *
	 * 永続化しない (メモリのみ)。永続化すると、リロードしただけでセッションが生き残り
	 * 「リロードで必ずロックへ戻る」保証が崩れる。
	 * コンポーネントはこの値を購読しない (毎操作で set しても再描画を起こさないため)。
	 */
	lastActivityAt: number;
	/**
	 * クールダウンの明け時刻 (performance.now())。0 = 待機なし。
	 *
	 * 永続化しない (メモリのみ)。failureCount からその場で算出してはいけない:
	 * failureCount は永続化されており、3 回失敗すると computeLockoutMs が常に正の値を返すため、
	 * 「照合しない → 解錠できない → failureCount がリセットされない」で恒久ロックアウトになる。
	 * 待機は「失敗した時点から一定時間」であり、回数そのものではない。
	 */
	lockoutUntil: number;

	/** 認証成功。DISABLED からは遷移しない。第 2 引数はセッション開始時刻。 */
	unlock: (now?: number) => void;
	/** 操作を記録してセッションを延長する。 */
	touchSession: (now: number) => void;
	/** 即ロック (バックグラウンド復帰など)。UNLOCKED のときのみ。 */
	lock: () => void;
	/** opt-in 有効化。永続化に失敗したら false (状態は変えない)。 */
	enable: (record: AppLockRecord) => boolean;
	/** レコードを更新する (生体の登録/解除、パスコード変更)。 */
	updateRecord: (record: AppLockRecord) => boolean;
	/** ロック解除 (機能そのものの無効化)。永続レコードを破棄する。 */
	disable: () => void;
	/**
	 * パスコードの解錠失敗を記録する (回数を増やして永続化し、クールダウンを開始する)。
	 * now は performance.now()。省略時は現在時刻。
	 */
	noteFailure: (reason: LockFailure, now?: number) => void;
	/**
	 * 回数を増やさずに理由だけ記録する。生体認証の失敗に使う。
	 *
	 * 生体認証のキャンセルは「攻撃の試行」ではなく日常的に起きる (プロンプトを閉じた、
	 * 顔を認識しなかった、自動呼び出しがユーザー操作なしで拒否された)。これを failureCount に
	 * 混ぜるとパスコード入力のクールダウンが誤発動し、正当なユーザーが待たされる。
	 * 生体認証の連続失敗は OS 側が既にレート制限している (docs/app-lock-spec.md §5.1)。
	 */
	noteSoftFailure: (reason: LockFailure) => void;
	setBusy: (busy: boolean) => void;
	setWebauthnAvailable: (available: boolean) => void;
	clearFailure: () => void;
}

const initialRecord = readRecord();
const initialMobile = isMobileEnv();

export const useAppLockStore = create<AppLockStoreState>()((set) => ({
	status: resolveInitialStatus(initialRecord, initialMobile),
	record: initialRecord,
	webauthnAvailable: false,
	failureCount: initialRecord?.failureCount ?? 0,
	busy: false,
	lastFailure: null,
	lastActivityAt: 0,
	// 起動時は待機なし。永続化した failureCount から算出しないのは上記コメントの理由。
	lockoutUntil: 0,

	// 解錠と同時にセッションを開始する (now を渡さない呼び出しは 0 = 即期限切れ扱いに
	// しないよう、呼び出し側が必ず時刻を渡す設計。省略時は performance.now())。
	unlock: (now) =>
		set((s) => {
			if (s.status !== AppLockStatus.LOCKED) return s;
			const lastActivityAt = now ?? performance.now();
			if (s.record && s.record.failureCount !== 0) {
				const next = { ...s.record, failureCount: 0 };
				writeRecord(next);
				return {
					status: AppLockStatus.UNLOCKED,
					record: next,
					failureCount: 0,
					lastFailure: null,
					lastActivityAt,
					lockoutUntil: 0,
				};
			}
			return {
				status: AppLockStatus.UNLOCKED,
				failureCount: 0,
				lastFailure: null,
				lastActivityAt,
				lockoutUntil: 0,
			};
		}),

	// 操作のたびに呼ばれる。購読しているコンポーネントが無いので再描画は起きない。
	touchSession: (now) => set({ lastActivityAt: now }),

	lock: () =>
		set((s) => (s.status === AppLockStatus.UNLOCKED ? { status: AppLockStatus.LOCKED } : s)),

	enable: (record) => {
		if (!writeRecord(record)) return false;
		// 設定した本人はそのまま使えるように UNLOCKED + セッション開始で始める。
		set({
			status: AppLockStatus.UNLOCKED,
			record,
			failureCount: record.failureCount,
			lastFailure: null,
			lastActivityAt: performance.now(),
		});
		return true;
	},

	updateRecord: (record) => {
		if (!writeRecord(record)) return false;
		set({ record, failureCount: record.failureCount });
		return true;
	},

	disable: () => {
		clearRecord();
		set({
			status: AppLockStatus.DISABLED,
			record: null,
			failureCount: 0,
			lastFailure: null,
			lockoutUntil: 0,
		});
	},

	noteFailure: (reason, now) =>
		set((s) => {
			const failureCount = s.failureCount + 1;
			// 待機は「今から一定時間」。回数は待機の長さを決めるだけ。
			const wait = computeLockoutMs(failureCount);
			const lockoutUntil = wait > 0 ? (now ?? performance.now()) + wait : 0;
			if (s.record) {
				const next = { ...s.record, failureCount };
				writeRecord(next);
				return { record: next, failureCount, lastFailure: reason, lockoutUntil };
			}
			return { failureCount, lastFailure: reason, lockoutUntil };
		}),

	noteSoftFailure: (reason) => set({ lastFailure: reason }),

	setBusy: (busy) => set({ busy }),
	setWebauthnAvailable: (webauthnAvailable) => set({ webauthnAvailable }),
	clearFailure: () => set({ lastFailure: null }),
}));

/** ロック中か (React 用 selector hook)。ゲートの分岐に使う。 */
export const useIsAppLocked = (): boolean =>
	useAppLockStore((s) => s.status === AppLockStatus.LOCKED);
