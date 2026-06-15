import { useEffect, useState } from "react";
import { useViewerListContextMenu } from "../bridge/useViewerBridge";
import { ViewerCommands } from "../bridge/ViewerCommands";

type MenuState = { kind: "slide" | "list"; top: number; left: number } | null;

export function ListContextMenus() {
	const requestedMenu = useViewerListContextMenu();
	const [menu, setMenu] = useState<MenuState>(null);

	useEffect(() => {
		setMenu(requestedMenu);
	}, [requestedMenu]);

	useEffect(() => {
		if (!menu) return;
		const closeMenu = () => setMenu(null);
		document.addEventListener("mouseup", closeMenu);
		return () => document.removeEventListener("mouseup", closeMenu);
	}, [menu]);

	const closeAndRun = (command: () => void) => {
		setMenu(null);
		command();
	};

	const getMenuStyle = (kind: "slide" | "list"): React.CSSProperties => ({
		display: menu?.kind === kind ? "block" : "none",
		top: menu?.kind === kind ? menu.top : undefined,
		left: menu?.kind === kind ? menu.left : undefined,
	});

	return (
		<>
			<ul
				id="slideContextMenu"
				className="contextMenu menu"
				data-react-controlled="true"
				onMouseUp={(event) => event.stopPropagation()}
				style={getMenuStyle("slide")}>
				<li>
					<button
						className="delete"
						data-react-controlled="true"
						onClick={() => closeAndRun(ViewerCommands.deleteContextSlide)}>
						<i className="far fa-trash-alt"></i> <span>delete this slide</span>
					</button>
				</li>
				<li>
					<button
						className="enable"
						data-react-controlled="true"
						onClick={() => closeAndRun(ViewerCommands.enableOnlyContextSlide)}>
						<i className="far fa-check-square"></i> <span>enable only this slide</span>
					</button>
				</li>
			</ul>
			<ul
				id="listContextMenu"
				className="contextMenu menu"
				data-react-controlled="true"
				onMouseUp={(event) => event.stopPropagation()}
				style={getMenuStyle("list")}>
				<li>
					<button
						className="unjoin"
						data-react-controlled="true"
						onClick={() => closeAndRun(ViewerCommands.unjoinAllSlides)}>
						<i className="fas fa-unlink"></i> <span>toggle joining all slides</span>
					</button>
				</li>
				<li>
					<button
						className="delete"
						data-react-controlled="true"
						onClick={() => closeAndRun(ViewerCommands.deleteDisabledSlides)}>
						<i className="far fa-trash-alt"></i> <span>delete disabled slides</span>
					</button>
				</li>
				<li>
					<button
						className="enable"
						data-react-controlled="true"
						onClick={() => closeAndRun(ViewerCommands.enableAllSlides)}>
						<i className="far fa-check-square"></i> <span>enable all slides</span>
					</button>
				</li>
				<li>
					<button
						className="disable"
						data-react-controlled="true"
						onClick={() => closeAndRun(ViewerCommands.disableAllSlides)}>
						<i className="far fa-square"></i> <span>disable all slides</span>
					</button>
				</li>
			</ul>
		</>
	);
}

export const LegacyListContextMenus = ListContextMenus;

