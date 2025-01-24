import { data } from "jquery";
import { SetStateAction, useEffect, useState } from "react";
import { RSlide } from "../model/Slide";
import { RViewerDocument, ViewerDocument } from "../model/ViewerDocument";
import { SlideList } from "./list/SlideList";
import { ViewerMode } from "../Viewer";
import { SlideEdit } from "./edit/SlideEdit";
import { ConfigPanel } from "./ConfigPanel";
import { ImagePanel } from "./ImagePanel";
import { ControlPanel } from "./control/ControlPanel";
import { ModalProvider } from "../provider/ModalProvider";
import { DocumentProvider } from "../provider/DocumentProvider";

export const Viewer: React.FC<{}> = () => {
	const [mode, setMode] = useState<ViewerMode>(ViewerMode.SELECT);
	// const [slides, setSlides] = useState<RSlide[]>([]);
	const [selectedSlide, setSelectedSlide] = useState<RSlide | undefined>(undefined);

	// useEffect(() => {
	// 	setSlides(vdoc?.slides || []);
	// }, [vdoc]);

	return (
		<div className="h-full w-full p-4 flex flex-col gap-4 overflow-none">
			<ModalProvider>
				<DocumentProvider>
					<ControlPanel setMode={setMode} />
					{mode == ViewerMode.EDIT && <SlideEdit setMode={setMode} selectedSlide={selectedSlide} />}
					<SlideList
						mode={mode}
						setMode={setMode}
						selectedSlide={selectedSlide}
						setSelectedSlide={setSelectedSlide}
					/>
					{mode == ViewerMode.SLIDESHOW && <>slideshow</>}
				</DocumentProvider>
			</ModalProvider>
		</div>
	);
};
