import { FeatureGate, getFeatureGate } from "../runtime/featureGate";
import { MainShell } from "./MainShell";
import { ImagesPanel, PrefPanel } from "./Panels";

type AppShellProps = {
	gate?: FeatureGate;
};

export function AppShell({ gate = getFeatureGate("browser") }: AppShellProps) {
	return (
		<>
			<div id="pref">
				<PrefPanel />
			</div>
			<div id="images">
				<ImagesPanel />
			</div>
			<div id="main">
				<MainShell gate={gate} />
			</div>
		</>
	);
}

export const LegacyAppShell = AppShell;
