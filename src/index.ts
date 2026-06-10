import "@fortawesome/fontawesome-free/css/all.css";
import $ from "jquery";
import "jquery-ui-dist/jquery-ui";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Viewer, ViewerStartUpMode } from "./Viewer";
import { AppShell } from "./react/AppShell";
import { mountRuntimeShell } from "./react/mountRuntimeShell";
import { applyFeatureGate } from "./runtime/applyFeatureGate";
import { getFeatureGate } from "./runtime/featureGate";
import { setUpMobileLandscapeFallback } from "./runtime/mobileOrientation";
import { resolveRuntimeMode } from "./runtime/mode";

import "../css/slideShow.scss";
import "../css/ui.scss";

$(function () {
	const runtimeMode = resolveRuntimeMode();
	const gate = getFeatureGate(runtimeMode);

	const wrapper = document.getElementById("wrapper");
	if (wrapper) {
		const root = createRoot(wrapper);
		flushSync(() => {
			root.render(createElement(AppShell));
		});
	}
	document.body.setAttribute("data-runtime-mode", runtimeMode);
	mountRuntimeShell({ mode: runtimeMode, gate });
	applyFeatureGate(gate);

	const startUpMode = gate.canEdit ? ViewerStartUpMode.VIEW_AND_EDIT : ViewerStartUpMode.VIEW_ONLY;
	new Viewer($("body"), startUpMode, gate);

	if (runtimeMode === "mobile-pwa") {
		setUpMobileLandscapeFallback(document.getElementById("wrapper"));
	}
});
