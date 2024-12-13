import { useCallback, useState } from "react";
import { FaEdit, FaMinus, FaPlus, FaTimes } from "react-icons/fa";
import { Button, ButtonGroup, Checkbox, IconButton } from "rsuite";
import classNames from "classnames";
import { useExtendableTimeout } from "../../hooks/useExtendableTimer";
import { RSlide, Slide } from "../../model/Slide";
import { CanvasSlideView } from "../slide/CanvasSlideView";
import { ViewerMode } from "../../Viewer";
import { FaLink } from "react-icons/fa";

export const SlideThumbnail: React.FC<{
	slide: RSlide;
	updateSlide: (id: string, updatedSlide: Partial<Slide>) => void;
	mode: ViewerMode;
	scale: number;
	onSelect: (slide: RSlide) => void;
	onEdit: (slide: RSlide) => void;
	onDelete: (slide: RSlide) => void;
	onClone: (slide: RSlide) => void;
	onContextMenu: (slide: RSlide, x: number, y: number) => void;
}> = ({ slide, updateSlide, mode, scale, onSelect, onEdit, onDelete, onClone, onContextMenu }) => {
	const [dblClickLock, setDblClickLock] = useState(false);
	const [setTimeout] = useExtendableTimeout();

	const durationStr =
		slide.durationRatio !== 1 ? "x" + slide.durationRatio.toString().substring(0, 3) : "";

	const lockDoubleClick = () => {
		setDblClickLock(true);
		setTimeout(() => {
			setDblClickLock(false);
		}, 300);
	};

	const doubleClickHandler = useCallback(() => {
		if (dblClickLock) return;
		onEdit(slide);
	}, [dblClickLock, onEdit, slide]);

	const adjustDuration = (increase: boolean) => {
		lockDoubleClick();

		const step = slide.durationRatio >= 2 ? 1 : slide.durationRatio >= 1 ? 0.5 : 0.2;
		const nextDuration = increase
			? Math.min(slide.durationRatio + step, 9)
			: Math.max(slide.durationRatio - step, 0.2);

		updateSlide(slide.uuid, { durationRatio: nextDuration });
	};

	var durationCorrection: number = Math.atan(slide.durationRatio - 1) * 0.5 + 1;
	if (slide.durationRatio < 1) {
		durationCorrection = Math.pow(slide.durationRatio, 0.4);
	}
	var fitWidth = Math.round(scale * slide.width * durationCorrection);

	return (
		<div
			style={{ width: fitWidth }}
			className={classNames(
				slide.disabled ? "disabled" : "",
				slide.joining ? "joining" : "",
				"flex justify-center relative shadow-md bg-white rounded-md overflow-hidden"
			)}
			onClick={() => onSelect(slide)}
			onDoubleClick={doubleClickHandler}
			onContextMenu={(e) => {
				e.preventDefault();
				onContextMenu(slide, e.clientX, e.clientY);
			}}>
			{mode === ViewerMode.SELECT && (
				<>
					<IconButton
						icon={<FaTimes />}
						className="absolute right-0 top-0"
						onClick={() => onDelete(slide)}
					/>
					<IconButton
						icon={<FaPlus />}
						className="absolute left-0 top-0"
						onClick={() => onClone(slide)}
					/>
					<IconButton
						icon={<FaEdit />}
						className="absolute left-0 bottom-0"
						onClick={() => onDelete(slide)}
					/>
				</>
			)}
			<ButtonGroup className="absolute z-10 w-full bottom-0 opacity-0 hover:opacity-100" justified>
				<IconButton icon={<FaMinus />} className="down" onClick={() => adjustDuration(false)} />
				<Button>{durationStr}</Button>
				<IconButton icon={<FaPlus />} className="up" onClick={() => adjustDuration(true)} />
			</ButtonGroup>

			<IconButton
				icon={<FaLink />}
				className="absolute right-[-10px] top-[50%] transform -translate-y-1/2"
				onClick={() => updateSlide(slide.uuid, { joining: !slide.joining })}
			/>

			<div
				className="absolute left-0 h-full"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();

					updateSlide(slide.uuid, { joining: !slide.joining });
				}}></div>

			<Checkbox
				className="absolute left-0 bottom-0 cursor-pointer"
				checked={!slide.disabled}
				onChange={() => {
					updateSlide(slide.uuid, { disabled: !slide.disabled });
				}}></Checkbox>
			<CanvasSlideView slide={slide} scale={scale} />
		</div>
	);
};
