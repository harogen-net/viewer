import { createRoot } from "react-dom/client";
import { LegacyCanvasMenu } from "./LegacyCanvasMenu";

export function mountLegacyCanvasMenu() {
	const host = document.querySelector("#main .canvas > .menu") as HTMLElement | null;
	if (!host) {
		return;
	}
	const root = createRoot(host);
	root.render(<LegacyCanvasMenu />);
}
