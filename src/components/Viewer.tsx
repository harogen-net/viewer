import { data } from "jquery";
import { SetStateAction, useState } from "react";
import { RSlide } from "../model/Slide";
import { ViewerDocument } from "../model/ViewerDocument";
import { SlideList } from "./list/SlideList";
import { ViewerMode } from "../Viewer";
import { SlideEdit } from "./edit/SlideEdit";
import { ConfigPanel } from "./ConfigPanel";
import { ImagePanel } from "./ImagePanel";
import { ControlPanel } from "./control/ControlPanel";

export const Viewer: React.FC<{
	vdoc: ViewerDocument;
	setDocument: React.Dispatch<React.SetStateAction<ViewerDocument>>;
}> = ({ vdoc, setDocument }) => {
	const [mode, setMode] = useState<ViewerMode>(ViewerMode.SELECT);
	const [slides, setSlies] = useState<RSlide[]>(vdoc.slides);
	const [selectedSlide, setSelectedSlide] = useState<RSlide | undefined>(undefined);

	return (
		<div>
			<ControlPanel vdoc={vdoc} setMode={setMode} />
			{mode == ViewerMode.EDIT && <SlideEdit setMode={setMode} selectedSlide={selectedSlide} />}
			<SlideList
				mode={mode}
				setMode={setMode}
				slides={slides}
				setSlides={setSlies}
				selectedSlide={selectedSlide}
				setSelectedSlide={setSelectedSlide}
			/>
			<ConfigPanel vdoc={vdoc} />
			<ImagePanel />
			{mode == ViewerMode.SLIDESHOW && <>slideshow</>}
		</div>
	);
};
