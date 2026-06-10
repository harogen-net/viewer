import { LegacyCanvasMenu } from "./LegacyCanvasMenu";
import { LegacyListContextMenus } from "./LegacyListContextMenus";
import {
    LegacyCopyPasteControls,
    LegacyImageRefControls,
    LegacyLayerControls,
    LegacyPropertyControls,
    LegacySwapControls,
    LegacyTextEditControls,
} from "./LegacySideControls";

export function MainShell() {
	return (
		<>
			<div className="canvas">
				<div className="menu">
					<LegacyCanvasMenu />
				</div>
				<div className="sideMenu">
					<div className="property">
						<div>
							<LegacyPropertyControls />
						</div>
						<div className="copypaste">
							<LegacyCopyPasteControls />
						</div>
						<div className="imageRef">
							<LegacyImageRefControls />
						</div>
						<div className="textEdit">
							<LegacyTextEditControls />
						</div>
						<div className="swap">
							<LegacySwapControls />
						</div>
					</div>
					<div className="layer">
						<LegacyLayerControls />
					</div>
				</div>
			</div>
			<div className="list">
				<LegacyListContextMenus />
			</div>
		</>
	);
}

export const LegacyMainShell = MainShell;
