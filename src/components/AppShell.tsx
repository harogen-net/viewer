import { MantineProvider } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useEffect, useState } from "react";
import { loadFixtureFromQuery, loadLatestFromIndexedDB } from "../devFixtureLoader";
import { useSlideStore } from "../state/slideStore";
import { useViewerDocumentStore } from "../state/viewerDocumentStore";
import { ProgressBar } from "./ProgressBar";
import { SlideshowShell } from "./SlideshowShell";

// `?new=1` 起動か判定 (v3 §0-8 dual entrypoint)。
// 新側モードでは Group A の build 中につき placeholder を出す。
// 通常モード (レガシー) では従来通り ProgressBar のみ。
const isNewMode =
	typeof window !== "undefined" &&
	new URLSearchParams(window.location.search).get("new") === "1";

// dev 専用の左右モード切替リンク (v3 開発中の手動確認用、Group D 末尾で削除)。
const modeSwitchLinkStyle: CSSProperties = {
	position: "fixed",
	bottom: 6,
	right: 6,
	zIndex: 99999,
	padding: "4px 10px",
	background: "rgba(0,0,0,0.7)",
	color: "#fff",
	textDecoration: "none",
	fontFamily: "monospace",
	fontSize: 12,
	borderRadius: 4,
};

const NewSidePanel: FC = () => {
	const setDocument = useViewerDocumentStore((s) => s.setDocument);
	const title = useViewerDocumentStore((s) => s.meta?.title);
	const slideCount = useSlideStore((s) => s.slides.length);
	const [showSlideshow, setShowSlideshow] = useState(false);
	const [loadMsg, setLoadMsg] = useState<string | null>(null);

	// `?fixture=<name>` クエリがあれば mount 時に自動ロード (v3 Group A build 7、
	// Group B 完成時に削除予定)。
	useEffect(() => {
		loadFixtureFromQuery()
			.then((doc) => {
				if (doc) setDocument(doc);
			})
			.catch((e) => console.error("[AppShell] fixture load error:", e));
	}, [setDocument]);

	// レガシーが IndexedDB に保存した最新ドキュメントをロード (dev 用ボタン)。
	const handleLoadLatest = () => {
		setLoadMsg("loading...");
		loadLatestFromIndexedDB()
			.then((doc) => {
				if (doc) {
					setDocument(doc);
					setLoadMsg(`loaded: ${doc.title} (${doc.slides.length} slides)`);
				} else {
					setLoadMsg("該当データなし (レガシーで一度も保存していない可能性)");
				}
			})
			.catch((e) => {
				console.error("[AppShell] load latest failed:", e);
				setLoadMsg(`error: ${String(e)}`);
			});
	};

	return (
		<>
			<div style={{ padding: 20, fontFamily: "monospace" }}>
				<h2>v3 new side (Group A: SlideShow)</h2>
				<p>document: {title ?? "(未ロード)"} / slides: {slideCount}</p>
				<div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
					<button
						type="button"
						onClick={handleLoadLatest}
						style={{ padding: "4px 12px", fontFamily: "inherit" }}
					>
						📥 最新データ読込 (IndexedDB)
					</button>
					<button
						type="button"
						onClick={() => setShowSlideshow(true)}
						disabled={slideCount === 0}
						style={{ padding: "4px 12px", fontFamily: "inherit" }}
					>
						▶ slideshow 開始
					</button>
				</div>
				{loadMsg && <p style={{ fontSize: 11, color: "#666" }}>{loadMsg}</p>}
				<p style={{ fontSize: 11, color: "#666" }}>
					代替: <code>?new=1&amp;fixture=2026-06-16_170948.hvd</code> 等でテスト fixture もロード可。
				</p>
			</div>
			<SlideshowShell open={showSlideshow} onClose={() => setShowSlideshow(false)} />
		</>
	);
};

export const AppShell: FC = () => (
	<MantineProvider>
		{isNewMode ? (
			<>
				<NewSidePanel />
				<a href="/" style={modeSwitchLinkStyle}>→ legacy</a>
			</>
		) : (
			<a href="/?new=1" style={modeSwitchLinkStyle}>→ new (v3)</a>
		)}
		<ProgressBar />
	</MantineProvider>
);
