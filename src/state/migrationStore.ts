import { create } from "zustand";

// 旧形式ドキュメント (v2 スキーマ) の移行状態 (docs/document-id-plan.md)。
//
// **移行は自動で走らせない。** 起動時に「調べるだけ」で、実際の移行はユーザーが
// 二段階の確認を通したときだけ実行する。理由:
//   - 移行はストレージのスキーマ変更を伴い、**元に戻せない** (IndexedDB は version を下げられない)
//   - 一度実行すると、旧版のアプリではデータストアを開けなくなる
// 調べる段階ではスキーマに一切触れないので、ユーザーは「まだ何も変わっていない」状態で
// 旧版に戻り、書き出し (バックアップ) を取ってから出直せる。これが二段階確認の意味。
//
// 文字列 union ではなく const オブジェクト + 派生型 (LayerType / LaunchMode と同方針)。

export const MigrationStatus = {
	/** 未調査 (起動直後)。ストレージ API はまだ触らせない。 */
	UNKNOWN: "unknown",
	/** 旧形式データ無し。通常運転。 */
	NONE: "none",
	/** 旧形式データあり、ユーザーの承認待ち。ストレージ API は不活性。 */
	PENDING: "pending",
	/** 移行実行中。 */
	RUNNING: "running",
	/** 移行完了 (このセッションで実行した)。通常運転。 */
	DONE: "done",
	/** 移行に失敗。旧データは残っている (次回起動でやり直せる)。 */
	FAILED: "failed",
} as const;
export type MigrationStatus = (typeof MigrationStatus)[keyof typeof MigrationStatus];

/** 新ストアへ書き込んでよい状態か。PENDING の間は false (スキーマを変えないため)。 */
export const isStorageReady = (status: MigrationStatus): boolean =>
	status === MigrationStatus.NONE || status === MigrationStatus.DONE;

/**
 * 読み取りができる状態か。**PENDING でも true**。
 *
 * 承認前でも旧ストアからの読み取りだけは通す。移行前にバックアップを取ってほしいのに、
 * 一覧が空では書き出しようがないため。旧ストアの読み取りは version を指定せずに開くので
 * スキーマには触れない (docs/document-id-plan.md の設計変更を参照)。
 */
export const isStorageReadable = (status: MigrationStatus): boolean =>
	isStorageReady(status) || status === MigrationStatus.PENDING;

interface MigrationState {
	status: MigrationStatus;
	/** 旧形式で残っているドキュメント数 (PENDING 時のみ意味を持つ)。 */
	legacyCount: number;
	/** 旧形式ドキュメントのタイトル (確認画面で「何が移るのか」を見せるため)。 */
	legacyTitles: string[];
	/** 移行の進捗 0..1 (RUNNING 時のみ)。 */
	progress: number;
	/** 失敗時のメッセージ (FAILED 時のみ)。 */
	error: string | null;
	setProbed: (count: number, titles: string[]) => void;
	setRunning: () => void;
	setProgress: (progress: number) => void;
	setDone: () => void;
	setFailed: (error: string) => void;
}

export const useMigrationStore = create<MigrationState>()((set) => ({
	status: MigrationStatus.UNKNOWN,
	legacyCount: 0,
	legacyTitles: [],
	progress: 0,
	error: null,
	setProbed: (count, titles) =>
		set({
			status: count > 0 ? MigrationStatus.PENDING : MigrationStatus.NONE,
			legacyCount: count,
			legacyTitles: titles,
		}),
	setRunning: () => set({ status: MigrationStatus.RUNNING, progress: 0, error: null }),
	setProgress: (progress) => set({ progress }),
	setDone: () => set({ status: MigrationStatus.DONE, progress: 1, legacyCount: 0 }),
	setFailed: (error) => set({ status: MigrationStatus.FAILED, error }),
}));
