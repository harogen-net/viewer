import { MainShell } from "./MainShell";
import { ImagesPanel, PrefPanel } from "./Panels";

export function AppShell() {
	return (
		<>
			<div id="pref">
				<PrefPanel />
			</div>
			<div id="images">
				<ImagesPanel />
			</div>
			<div id="main">
				<MainShell />
			</div>
		</>
	);
}

export const LegacyAppShell = AppShell;
