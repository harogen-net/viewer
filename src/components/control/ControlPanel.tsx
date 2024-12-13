import { Button, ButtonGroup, Dropdown, IconButton, Whisper } from "rsuite";
import { ViewerDocument } from "../../model/ViewerDocument";
import { FaPlay } from "react-icons/fa";
import { ViewerMode } from "../../Viewer";
import { FaFile } from "react-icons/fa";
import { FaFileExport } from "react-icons/fa";
import { FaFileImport } from "react-icons/fa";
import { FaFileArchive } from "react-icons/fa";
import { FaChevronLeft } from "react-icons/fa";
import { FaChevronRight } from "react-icons/fa";
import { FileSelector } from "./FileSelector";
import { SetStateAction } from "react";

export const ControlPanel: React.FC<{
	vdoc: ViewerDocument;
	setMode: React.Dispatch<React.SetStateAction<ViewerMode>>;
}> = ({ vdoc, setMode }) => {
	return (
		<div className="flex gap-2">
			<IconButton
				icon={<FaPlay />}
				size="lg"
				color="red"
				onClick={() => {
					setMode(ViewerMode.SLIDESHOW);
				}}></IconButton>
			<Dropdown title="Files...">
				<Dropdown.Item icon={<FaFile />} onSelect={() => {}}>
					New
				</Dropdown.Item>
				<Dropdown.Item icon={<FaFileImport />} onSelect={() => {}}>
					Import
				</Dropdown.Item>
				<Dropdown.Item icon={<FaFileExport />} onSelect={() => {}}>
					Export
				</Dropdown.Item>
				<Dropdown.Item icon={<FaFileArchive />} onSelect={() => {}}>
					Export Images
				</Dropdown.Item>
			</Dropdown>

			<FileSelector
				setDocument={function (value: SetStateAction<ViewerDocument>): void {
					throw new Error("Function not implemented.");
				}}
			/>
		</div>
	);
};
