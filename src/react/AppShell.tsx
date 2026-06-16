import { FeatureGate, getFeatureGate } from "../runtime/featureGate";
import { MainShell } from "./MainShell";

type AppShellProps = {
	gate?: FeatureGate;
};

export function AppShell({ gate = getFeatureGate("browser") }: AppShellProps) {
	return (
		<>
			<div id="main">
				<MainShell gate={gate} />
			</div>
		</>
	);
}

