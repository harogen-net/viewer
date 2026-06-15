import { FeatureGate, getFeatureGate } from "../runtime/featureGate";
import { MainShell } from "./MainShell";
import { ImagesPanel } from "./Panels";

type AppShellProps = {
	gate?: FeatureGate;
};

export function AppShell({ gate = getFeatureGate("browser") }: AppShellProps) {
	return (
		<>
			<div id="images">
				<ImagesPanel />
			</div>
			<div id="main">
				<MainShell gate={gate} />
			</div>
		</>
	);
}

