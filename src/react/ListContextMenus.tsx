export function ListContextMenus() {
	return (
		<>
			<ul id="slideContextMenu" className="contextMenu menu">
				<li>
					<button className="delete" data-react-controlled="true">
						<i className="far fa-trash-alt"></i> <span>delete this slide</span>
					</button>
				</li>
				<li>
					<button className="enable" data-react-controlled="true">
						<i className="far fa-check-square"></i> <span>enable only this slide</span>
					</button>
				</li>
			</ul>
			<ul id="listContextMenu" className="contextMenu menu">
				<li>
					<button className="unjoin" data-react-controlled="true">
						<i className="fas fa-unlink"></i> <span>toggle joining all slides</span>
					</button>
				</li>
				<li>
					<button className="delete" data-react-controlled="true">
						<i className="far fa-trash-alt"></i> <span>delete disabled slides</span>
					</button>
				</li>
				<li>
					<button className="enable" data-react-controlled="true">
						<i className="far fa-check-square"></i> <span>enable all slides</span>
					</button>
				</li>
				<li>
					<button className="disable" data-react-controlled="true">
						<i className="far fa-square"></i> <span>disable all slides</span>
					</button>
				</li>
			</ul>
		</>
	);
}

export const LegacyListContextMenus = ListContextMenus;

