import { FeatureGate } from "./featureGate";

export function applyFeatureGate(gate: FeatureGate): void {
	if (!gate.canEdit) {
		document.body.classList.add("runtime-readonly");

		// Hide edit-heavy tool areas and keep slideshow/list viewing focused.
		const pref = document.getElementById("pref");
		const images = document.getElementById("images");
		if (pref) pref.style.display = "none";
		if (images) images.style.display = "none";
	}
	// canImport gate is handled by RuntimeShell via FeatureGate props.
}
