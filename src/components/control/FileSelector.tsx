import { FaChevronLeft, FaChevronRight, FaDownload, FaFile, FaTrash } from "react-icons/fa";
import { FaSave } from "react-icons/fa";
import { ButtonGroup, IconButton, Dropdown, Button } from "rsuite";
import { SlideTitle, useStorage } from "../../hooks/useStorage";
import { RViewerDocument } from "../../model/ViewerDocument";
import { useCallback, useEffect, useState } from "react";
import { ModalType, useModal } from "../../hooks/useModal";
import classNames from "classnames";
import { useDocument } from "../../hooks/useDocument";

export const FileSelector: React.FC<{}> = ({}) => {
	const { titles, save, load, remove } = useStorage();
	const { modalConfig, setModalConfig } = useModal();
	const { setDocument } = useDocument();

	const [selectedTitle, setSelectedSlide] = useState<SlideTitle | undefined>(undefined);
	const [selectedIndex, setSelectedIndex] = useState<number>(-1);

	useEffect(() => {
		console.log(titles);
		if (selectedTitle) {
			if (titles.find((title) => title.id === selectedTitle.id) === undefined) {
				setSelectedSlide(undefined);
			}
		}
	}, [titles]);

	useEffect(() => {
		console.log(modalConfig);
	}, [modalConfig]);

	useEffect(() => {
		if (selectedTitle) {
			// load slide data
			load(selectedTitle.id)
				.then((vdoc) => {
					if (vdoc) {
						setDocument(vdoc);
					}
				})
				.catch((e) => {
					console.error(e);
				});
		}
	}, [selectedTitle?.title]);

	useEffect(() => {
		setSelectedIndex(titles.findIndex((title) => title.id === selectedTitle?.id));
	}, [titles, selectedTitle]);

	const changeSlide = useCallback(
		(direction: boolean) => {
			if (!selectedTitle) {
				setSelectedSlide(titles[0]);
				return;
			}
			let index = titles.findIndex((title) => title.id === selectedTitle.id);
			if (index === -1) {
				setSelectedSlide(titles[0]);
				return;
			}
			const newIndex = direction ? index + 1 : index - 1;
			if (newIndex >= 0 && newIndex < titles.length) {
				setSelectedSlide(titles[newIndex]);
			}
		},
		[titles, selectedTitle]
	);

	const handleSave = useCallback(() => {
		// save(new RViewerDocument());
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
		setModalConfig({
			type: ModalType.ALERT,
			title: "fuga",
			text: `Are you sure you want to delete?`,
			onSubmit: () => {
				if (!selectedTitle) return;
				// remove(selectedTitle.id);
			},
		});
	}, [selectedTitle, remove]);

	return (
		<div className="flex gap-2">
			<div className="flex ">
				<IconButton
					className="rounded-r-none"
					icon={<FaChevronLeft />}
					onClick={() => {
						changeSlide(false);
					}}
				/>
				<Dropdown
					className="[&>button]:rounded-none [&>button]:w-full [&>button]:h-full w-[12rem]"
					title={selectedTitle ? selectedTitle.title : "-- quick save --"}>
					{titles.map((title, index) => (
						<Dropdown.Item
							key={index}
							onSelect={() => setSelectedSlide(title)}
							className={classNames(selectedTitle?.id === title.id ? "font-bold" : "")}>
							{index}: {title.title}
						</Dropdown.Item>
					))}
				</Dropdown>
				<IconButton
					className="rounded-l-none"
					icon={<FaChevronRight />}
					onClick={() => {
						changeSlide(true);
					}}
				/>
			</div>

			<ButtonGroup>
				<IconButton icon={<FaSave />} onClick={handleSave} />
				<IconButton icon={<FaDownload />} onClick={handleLoad} />
				<IconButton icon={<FaTrash />} onClick={handleRemove} />
			</ButtonGroup>
		</div>
	);
};
