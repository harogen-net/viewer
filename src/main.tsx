import "@mantine/core/styles.css";
// グローバル微調整 (フォント底上げ等)。Mantine の css の後に読み込み上書きする。
import { AppShell } from "@/components/AppShell";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";

// アプリのエントリポイント。index.html が #root にこのモジュールをマウントする。

const rootEl = document.getElementById("root");
if (!rootEl) {
	throw new Error("main: #root element not found in index.html");
}
createRoot(rootEl).render(createElement(AppShell));
