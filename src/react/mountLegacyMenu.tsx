import { createRoot } from "react-dom/client";
import { LegacyMenu } from "./LegacyMenu";

export function mountLegacyMenu() {
	const host = document.getElementById("menu");
	if (!host) {
		return;
	}
	const root = createRoot(host);
	root.render(<LegacyMenu />);
}
