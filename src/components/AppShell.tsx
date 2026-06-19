import { MantineProvider } from "@mantine/core";
import type { FC } from "react";
import { ProgressBar } from "./ProgressBar";

// `?new=1` 起動か判定 (v3 §0-8 dual entrypoint)。
// 新側モードでは Group A の build 中につき placeholder を出す。
// 通常モード (レガシー) では従来通り ProgressBar のみ。
const isNewMode =
	typeof window !== "undefined" &&
	new URLSearchParams(window.location.search).get("new") === "1";

// dev 専用の左右モード切替リンク (v3 開発中の手動確認用、Group D 末尾で削除)。
const modeSwitchLinkStyle: React.CSSProperties = {
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

export const AppShell: FC = () => (
	<MantineProvider>
		{isNewMode ? (
			<>
				<div style={{ padding: 20, fontFamily: "monospace" }}>
					<h2>v3 new side</h2>
					<p>Group A (SlideShow) 開発中。次の build ターンで rendering chain を追加します。</p>
				</div>
				<a href="/" style={modeSwitchLinkStyle}>→ legacy</a>
			</>
		) : (
			<a href="/?new=1" style={modeSwitchLinkStyle}>→ new (v3)</a>
		)}
		<ProgressBar />
	</MantineProvider>
);
