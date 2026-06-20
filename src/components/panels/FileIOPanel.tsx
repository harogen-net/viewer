import { ActionIcon, Button, Group, Paper, Select, Stack, Text, Title, Tooltip } from "@mantine/core";
import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { useStorage, type StoredSlideTitle } from "../../hooks/useStorage";
import { useSlideStore } from "../../state/slideStore";
import { useViewerDocumentStore } from "../../state/viewerDocumentStore";
import type { ViewerDocument } from "../../types/ViewerDocument";

// ファイル IO パネル (v3 Group B build、§0-10 新側内製、Mantine UI)。
// レガシー src/viewController/file/FileSelector.ts (jQuery) + Viewer.ts の
// .save / .load / .new / .import / .export ハンドラ群を 1 component に統合。
//
// 現状サポート: 新規 / 開く / 保存 (新規 or 上書き) / 削除 (HVD JSON ベース)。
// import (File 取り込み) / export (PNG/HVZ ダウンロード) は別 build で追加予定。

const DEFAULT_WIDTH = 1792;
const DEFAULT_HEIGHT = 1120;

export const FileIOPanel: FC = () => {
	const { listTitles, loadByTitle, save, deleteByTitle } = useStorage();
	const setDocument = useViewerDocumentStore((s) => s.setDocument);
	const meta = useViewerDocumentStore((s) => s.meta);
	const slides = useSlideStore((s) => s.slides);

	const [titles, setTitles] = useState<StoredSlideTitle[]>([]);
	const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
	const [msg, setMsg] = useState<string | null>(null);

	// title 一覧を refresh (update 降順)。
	const refreshTitles = useCallback(async (): Promise<StoredSlideTitle[]> => {
		const ts = await listTitles();
		ts.sort((a, b) => b.update - a.update);
		setTitles(ts);
		return ts;
	}, [listTitles]);

	useEffect(() => {
		refreshTitles().catch((e) => console.error("[FileIOPanel] refreshTitles error:", e));
	}, [refreshTitles]);

	const wrap = (action: () => Promise<void>) => async () => {
		try {
			await action();
		} catch (e) {
			console.error("[FileIOPanel] error:", e);
			setMsg(`error: ${String(e)}`);
		}
	};

	const handleNew = wrap(async () => {
		const now = Date.now();
		setDocument({
			title: "(new)",
			width: DEFAULT_WIDTH,
			height: DEFAULT_HEIGHT,
			createTime: now,
			editTime: now,
			slides: [],
		});
		setMsg("new document created");
	});

	// 選択値で開く。null/空 = 最新 (titles 降順先頭)。
	const handleLoad = wrap(async () => {
		let titleToLoad = selectedTitle ?? "";
		if (!titleToLoad) {
			if (titles.length === 0) {
				setMsg("該当データなし");
				return;
			}
			titleToLoad = titles[0].title;
		}
		const doc = await loadByTitle(titleToLoad);
		if (doc) {
			setDocument(doc);
			setMsg(`loaded: ${doc.title} (${doc.slides.length} slides)`);
		} else {
			setMsg(`data missing for title: ${titleToLoad}`);
		}
	});

	const handleSave = (override: boolean) =>
		wrap(async () => {
			if (!meta) {
				setMsg("document が未ロード");
				return;
			}
			const doc: ViewerDocument = { ...meta, slides };
			const { title } = await save(doc, { override });
			setMsg(`saved as: ${title}`);
			await refreshTitles();
		});

	const handleDelete = wrap(async () => {
		if (!selectedTitle) {
			setMsg("削除する title を選択してください");
			return;
		}
		if (!window.confirm(`delete "${selectedTitle}" ?`)) return;
		await deleteByTitle(selectedTitle);
		setMsg(`deleted: ${selectedTitle}`);
		setSelectedTitle(null);
		await refreshTitles();
	});

	const canOverride = !!meta && meta.title !== "" && meta.title !== "(new)";
	const hasSlides = slides.length > 0;
	const selectData = titles.map((t) => ({ value: t.title, label: t.title }));

	return (
		<Paper withBorder p="md" radius="sm">
			<Stack gap="xs">
				<Group justify="space-between" align="center">
					<Title order={5}>File IO</Title>
					<Text size="xs" c="dimmed" ff="monospace">
						document: {meta?.title ?? "(none)"} / slides: {slides.length}
					</Text>
				</Group>
				<Group gap="xs" wrap="wrap">
					<Button size="xs" variant="default" onClick={handleNew}>
						📄 新規
					</Button>
					<Select
						placeholder="--- (最新を開く) ---"
						value={selectedTitle}
						onChange={setSelectedTitle}
						data={selectData}
						clearable
						searchable
						size="xs"
						w={260}
						nothingFoundMessage="(該当なし)"
					/>
					<Button size="xs" variant="default" onClick={handleLoad}>
						📂 開く
					</Button>
					<Button
						size="xs"
						variant="filled"
						color="blue"
						onClick={handleSave(false)}
						disabled={!hasSlides}
					>
						💾 保存 (新規)
					</Button>
					<Tooltip label="現在の document に上書き" disabled={canOverride}>
						<Button
							size="xs"
							variant="filled"
							color="blue"
							onClick={handleSave(true)}
							disabled={!canOverride || !hasSlides}
						>
							💾 上書き
						</Button>
					</Tooltip>
					<ActionIcon
						size="lg"
						variant="default"
						color="red"
						onClick={handleDelete}
						disabled={!selectedTitle}
						aria-label="削除"
					>
						🗑
					</ActionIcon>
				</Group>
				{msg && (
					<Text size="xs" c="dimmed" ff="monospace">
						{msg}
					</Text>
				)}
			</Stack>
		</Paper>
	);
};
