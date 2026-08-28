import { probeLegacyDocs, runLegacyMigration } from "@/hooks/useStorage";
import { MigrationStatus, useMigrationStore } from "@/state/migrationStore";
import { Alert, Button, Code, Group, List, Modal, Progress, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { CSSProperties, FC } from "react";
import { useEffect, useState } from "react";

// 旧形式ドキュメントの移行確認 (docs/document-id-plan.md)。
//
// 起動時に「調べるだけ」の probe を 1 回走らせ、旧形式が残っていれば確認を **2 回**出す。
// 2 回にしているのは、移行が取り消せないため:
//   - IndexedDB は version を下げられないので、実行した瞬間に旧版のアプリでは開けなくなる
//   - 承認するまではスキーマに触れない
// バックアップの実行そのものはユーザーに任せる (アプリ側では代行しない)。ここは警告のみ。
//
// **「後で」を選んでも読み込みと書き出しはできる** (旧ストアの読み取り専用モード)。
// 書き出しのために閉じたのに一覧が空では意味がないため。書込 (保存/削除) だけを止める。

/** 確認の段。1 = 説明と警告 / 2 = 最終確認。 */
const Step = { FIRST: 1, SECOND: 2 } as const;
type Step = (typeof Step)[keyof typeof Step];

// 対象文書名の一覧。件数が読めない (十数件以上ありうる) ので **打ち切らずスクロール**させる。
// 件数を隠すと「自分の文書が全部入っているか」を確認できず、移行を承認する判断ができない。
// 高さを vh で切るのは、スマホ横向き (viewport 高さ 400px 前後) でモーダルが縦に溢れないため。
const titleListStyle: CSSProperties = {
	maxHeight: "28vh",
	overflowY: "auto",
	border: "1px solid #dee2e6",
	borderRadius: 4,
	padding: "6px 6px 6px 22px",
	margin: 0,
};

// 「後で」で閉じた後に残る再開バー。画面下部中央に小さく出す (作業の邪魔をしない位置)。
const resumeBarStyle: CSSProperties = {
	position: "fixed",
	left: "50%",
	bottom: 8,
	transform: "translateX(-50%)",
	zIndex: 300,
	display: "flex",
	alignItems: "center",
	gap: 8,
	padding: "4px 10px",
	borderRadius: 6,
	border: "1px solid #f0c000",
	background: "#fff9db",
	boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
};

export const LegacyMigrationModal: FC = () => {
	const status = useMigrationStore((s) => s.status);
	const legacyCount = useMigrationStore((s) => s.legacyCount);
	const legacyTitles = useMigrationStore((s) => s.legacyTitles);
	const progress = useMigrationStore((s) => s.progress);
	const error = useMigrationStore((s) => s.error);
	const setProbed = useMigrationStore((s) => s.setProbed);
	const setRunning = useMigrationStore((s) => s.setRunning);
	const setProgress = useMigrationStore((s) => s.setProgress);
	const setDone = useMigrationStore((s) => s.setDone);
	const setFailed = useMigrationStore((s) => s.setFailed);

	const [step, setStep] = useState<Step>(Step.FIRST);
	// 「後で」を選んだら閉じる。状態は PENDING のまま (= 旧ストアの読み取り専用モード)。
	// 書き出しを終えたユーザーがリロードせずに戻れるよう、閉じている間は再開バーを出す。
	const [dismissed, setDismissed] = useState(false);

	// 起動時に 1 回だけ調べる。スキーマには触れない。
	useEffect(() => {
		let cancelled = false;
		probeLegacyDocs()
			.then(({ count, titles }) => {
				if (!cancelled) setProbed(count, titles);
			})
			.catch((e) => {
				// 調査に失敗したら移行不要として扱う (旧データは残るので次回やり直せる)。
				// ここで PENDING にするとストレージが永久に不活性になり、何もできなくなる。
				console.error("[migration] probe に失敗:", e);
				if (!cancelled) setProbed(0, []);
			});
		return () => {
			cancelled = true;
		};
	}, [setProbed]);

	const handleRun = (): void => {
		setRunning();
		runLegacyMigration(setProgress)
			.then((n) => {
				console.info(`[migration] 旧形式 ${n} 件を移行しました`);
				setDone();
			})
			.catch((e) => {
				console.error("[migration] 移行に失敗:", e);
				setFailed(e instanceof Error ? e.message : String(e));
			});
	};

	const running = status === MigrationStatus.RUNNING;
	const failed = status === MigrationStatus.FAILED;
	const opened = (status === MigrationStatus.PENDING && !dismissed) || running || failed;
	if (!opened) {
		// 「後で」で閉じた後の再開導線。読み取り専用で作業できる状態が続いていることも示す。
		if (status === MigrationStatus.PENDING) {
			return (
				<div style={resumeBarStyle} data-migration-resume-bar>
					<Text size="xs">旧形式 {legacyCount} 件 — 保存するには移行が必要です</Text>
					<Button
						size="compact-xs"
						color="yellow"
						onClick={() => setDismissed(false)}
						data-migration-resume>
						移行する
					</Button>
				</div>
			);
		}
		return null;
	}

	return (
		<Modal
			opened
			onClose={() => {}}
			withCloseButton={false}
			closeOnEscape={false}
			closeOnClickOutside={false}
			centered
			title="保存データの移行"
			size="lg"
			// 短い viewport (スマホ横向きは高さ 400px 前後) でボタンが画面外へ押し出されないよう、
			// モーダル全体の高さを切って本文側をスクロールさせる。
			styles={{
				content: { maxHeight: "90vh", display: "flex", flexDirection: "column" },
				body: { overflowY: "auto" },
			}}
			data-migration-modal
			data-migration-step={running ? "running" : failed ? "failed" : step}>
			{running ? (
				<Stack gap="sm">
					<Text size="sm">移行しています。このタブを閉じないでください。</Text>
					<Progress value={progress * 100} striped animated data-migration-progress />
					<Text size="xs" c="dimmed">
						{Math.round(progress * legacyCount)} / {legacyCount} 件
					</Text>
				</Stack>
			) : failed ? (
				<Stack gap="sm">
					<Alert color="red" icon={<IconAlertTriangle />} title="移行に失敗しました">
						<Text size="sm">
							移行できなかったドキュメントは元の場所に残っています。データは失われていません。
							ページを再読み込みするとやり直せます。
						</Text>
						{error && (
							<Code block mt="xs">
								{error}
							</Code>
						)}
					</Alert>
					<Group justify="flex-end">
						<Button onClick={() => window.location.reload()} data-migration-reload>
							再読み込み
						</Button>
					</Group>
				</Stack>
			) : step === Step.FIRST ? (
				<Stack gap="sm">
					<Text size="sm">
						旧形式で保存されたドキュメントが <b>{legacyCount} 件</b> あります。
						移行するまで<b>保存と削除はできません</b>（読み込みと書き出しは今のままでも可能です）。
					</Text>
					<Alert color="yellow" icon={<IconAlertTriangle />} title="移行は取り消せません">
						<Text size="sm">
							移行すると、このデータは<b>旧バージョンのアプリでは開けなくなります</b>。
							<br />
							<b>今はまだ何も変更していません。</b>
							控えが必要なら「後で」で閉じ、各ドキュメントを開いて HVZ で書き出してから
							戻ってきてください。
						</Text>
					</Alert>
					{legacyTitles.length > 0 && (
						<>
							<Text size="xs" c="dimmed">
								対象のドキュメント ({legacyTitles.length} 件):
							</Text>
							<div style={titleListStyle} data-migration-titles>
								<List size="xs">
									{/* 同名が並びうるので key は index (旧一覧は title 一意でない)。 */}
									{legacyTitles.map((t, i) => (
										<List.Item key={`${i}-${t}`}>{t}</List.Item>
									))}
								</List>
							</div>
						</>
					)}
					<Group justify="flex-end">
						<Button variant="default" onClick={() => setDismissed(true)} data-migration-later>
							後で
						</Button>
						<Button color="yellow" onClick={() => setStep(Step.SECOND)} data-migration-next>
							移行に進む
						</Button>
					</Group>
				</Stack>
			) : (
				<Stack gap="sm">
					<Text size="sm">
						<b>{legacyCount} 件</b> のドキュメントを移行します。
					</Text>
					<Alert color="red" icon={<IconAlertTriangle />} title="最終確認">
						<Text size="sm">
							実行すると元に戻せません。書き出し（控え）は取りましたか？
						</Text>
					</Alert>
					<Group justify="flex-end">
						<Button variant="default" onClick={() => setStep(Step.FIRST)} data-migration-back>
							戻る
						</Button>
						<Button color="red" onClick={handleRun} data-migration-run>
							移行を実行する
						</Button>
					</Group>
				</Stack>
			)}
		</Modal>
	);
};
