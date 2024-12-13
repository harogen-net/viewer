import { FaChevronLeft, FaChevronRight, FaDownload, FaFile, FaTrash } from "react-icons/fa";
import { ButtonGroup, IconButton, Dropdown, Button } from "rsuite";
import { SlideTitle, useStorage } from "../../hooks/useStorage";
import { ViewerDocument } from "../../model/ViewerDocument";
import { useCallback, useEffect, useState } from "react";

export const FileSelector: React.FC<{
	setDocument: React.Dispatch<React.SetStateAction<ViewerDocument>>;
}> = ({ setDocument }) => {
	const { titles, save, load, remove } = useStorage();

	const [selectedTitle, setSelectedSlide] = useState<SlideTitle | undefined>(undefined);
	const [selectedIndex, setSelectedIndex] = useState<number>(-1);

	useEffect(() => {
		if (selectedTitle) {
			if (titles.find((title) => title.id === selectedTitle.id) === undefined) {
				setSelectedSlide(undefined);
			}
		}
	}, [titles]);

	useEffect(() => {
		if (selectedTitle) {
			// load slide data
		}
	}, [selectedTitle?.title]);

	useEffect(() => {
		setSelectedIndex(titles.findIndex((title) => title.id === selectedTitle?.id));
	}, [titles, selectedTitle]);

	const changeSlide = useCallback(
		(direction: boolean) => {
			if (!selectedTitle) {
				return;
			}
			const index = titles.findIndex((title) => title.id === selectedTitle.id);
			if (index === -1) {
				return;
			}
			const newIndex = direction ? index - 1 : index + 1;
			if (newIndex >= 0 && newIndex < titles.length) {
				setSelectedSlide(titles[newIndex]);
			}
		},
		[titles, selectedTitle]
	);

	const handleSave = useCallback(() => {
		save(new ViewerDocument());
	}, [save]);

	const handleLoad = useCallback(() => {
		if (!selectedTitle) return;
		load(selectedTitle.id)
			.then((vdoc) => {
				if (vdoc) {
					setDocument(vdoc);
				}
			})
			.catch((e) => {});
	}, [selectedTitle, load, setDocument]);

	const handleRemove = useCallback(() => {
		if (!selectedTitle) return;
		remove(selectedTitle.id);
	}, [selectedTitle, remove]);

	return (
		<div className="flex gap-2">
			<ButtonGroup>
				<IconButton
					icon={<FaChevronLeft />}
					onClick={() => {
						changeSlide(false);
					}}
				/>
				<Dropdown title={selectedTitle ? selectedTitle.title : "-- quick save --"}>
					{titles.map((title) => (
						<Dropdown.Item onSelect={() => setSelectedSlide(title)}>{title.title}</Dropdown.Item>
					))}
				</Dropdown>
				<IconButton
					icon={<FaChevronRight />}
					onClick={() => {
						changeSlide(true);
					}}
				/>
			</ButtonGroup>

			<ButtonGroup>
				<IconButton icon={<FaFile />} onClick={handleSave} />
				<IconButton icon={<FaDownload />} onClick={handleLoad} />
				<IconButton icon={<FaTrash />} onDoubleClick={handleRemove} />
			</ButtonGroup>
		</div>
	);
};
