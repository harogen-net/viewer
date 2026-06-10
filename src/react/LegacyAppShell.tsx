import { MainShell } from "./LegacyMainShell";
import { Menu } from "./LegacyMenu";
import { ImagesPanel, PrefPanel } from "./LegacyPanels";

export function AppShell() {
	return (
		<>
			<div id="pref">
				<PrefPanel />
			</div>
			<div id="images">
				<ImagesPanel />
			</div>
			<div id="menu" className="menu">
				<Menu />
			</div>
			<div id="main">
				<MainShell />
			</div>
		</>
	);
}

export const LegacyAppShell = AppShell;
