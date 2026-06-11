import $ from "jquery";
import { FeatureGate } from "./featureGate";

export function applyFeatureGate(gate: FeatureGate): void {
	if (!gate.canEdit) {
		document.body.classList.add("runtime-readonly");

		// Hide edit-heavy tool areas and keep slideshow/list viewing focused.
		$("#pref, #images").hide();
	}

	if (!gate.canImport) {
		$("button.import").prop("disabled", true);
	}
}
