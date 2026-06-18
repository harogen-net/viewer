import "@fortawesome/fontawesome-free/css/all.css";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Viewer } from "./Viewer";
import { AppShell } from "./react/AppShell";
import { mountRuntimeShell } from "./react/mountRuntimeShell";
import { getFeatureGate } from "./runtime/featureGate";
import { resolveRuntimeMode } from "./runtime/mode";
import { ViewerStartUpMode } from "./runtime/viewerMode";

import "../css/slideShow.scss";
import "../css/ui.scss";

document.addEventListener("DOMContentLoaded", () => {
	const runtimeMode = resolveRuntimeMode();
	const gate = getFeatureGate(runtimeMode);

	const wrapper = document.getElementById("wrapper");
	if (wrapper) {
		const root = createRoot(wrapper);
		flushSync(() => {
			root.render(createElement(AppShell, { gate }));
		});
	}
	document.body.setAttribute("data-runtime-mode", runtimeMode);
	mountRuntimeShell({ mode: runtimeMode, gate });

	const startUpMode = gate.canEdit ? ViewerStartUpMode.VIEW_AND_EDIT : ViewerStartUpMode.VIEW_ONLY;
	new Viewer(document.body, startUpMode, gate);
});
