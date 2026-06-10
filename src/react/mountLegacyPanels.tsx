import { createRoot } from "react-dom/client";
import { LegacyImagesPanel, LegacyPrefPanel } from "./LegacyPanels";

export function mountLegacyPanels() {
	const prefHost = document.getElementById("pref");
	if (prefHost) {
		const prefRoot = createRoot(prefHost);
		prefRoot.render(<LegacyPrefPanel />);
	}

	const imagesHost = document.getElementById("images");
	if (imagesHost) {
		const imagesRoot = createRoot(imagesHost);
		imagesRoot.render(<LegacyImagesPanel />);
	}
}
