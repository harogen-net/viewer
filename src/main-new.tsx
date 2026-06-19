import "@mantine/core/styles.css";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./components/AppShell";

// v3 Group A 新側エントリポイント (Strangler fig dual entrypoint、§0-8)。
// `?new=1` 起動時にレガシー (src/index.ts) を bypass し React 単体で起動する。
// Group D 末尾の最終 swap で src/main.tsx に統合され、src/index.ts は削除される。

console.log("[main-new] module evaluated");

const rootEl = document.getElementById("root");
if (!rootEl) {
	throw new Error("v3 main-new: #root element not found in index.html");
}
console.log("[main-new] mounting <AppShell /> into #root");
createRoot(rootEl).render(createElement(AppShell));
