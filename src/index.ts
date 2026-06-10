import "@fortawesome/fontawesome-free/css/all.css";
import $ from "jquery";
import "jquery-ui-dist/jquery-ui";
import { Viewer, ViewerStartUpMode } from "./Viewer";
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

	document.body.setAttribute("data-runtime-mode", runtimeMode);
	mountRuntimeShell({ mode: runtimeMode, gate });
	applyFeatureGate(gate);

	const startUpMode = gate.canEdit ? ViewerStartUpMode.VIEW_AND_EDIT : ViewerStartUpMode.VIEW_ONLY;
	new Viewer($("body"), startUpMode, gate);

	if (runtimeMode === "mobile-pwa") {
		setUpMobileLandscapeFallback(document.getElementById("wrapper"));
	}
});
