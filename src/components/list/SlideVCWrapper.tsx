import { useState, useEffect, SetStateAction } from "react";
import { Slide, RSlide } from "../../model/Slide";
import { ViewerMode } from "../../Viewer";
import { SlideList } from "./SlideList";
import { ImageLayer, RImageLayer } from "../../model/layer/ImageLayer";
import { RTextLayer, TextLayer } from "../../model/layer/TextLayer";

export const SlideVCWrapper: React.FC<{
	mode: ViewerMode;
	slides: Slide[];
}> = ({ mode, slides }) => {
	const [slidesState, setSlidesState] = useState<RSlide[]>([]);
	const [selectedSlide, setSelectedSlide] = useState<RSlide | undefined>();

	useEffect(() => {
		setSlidesState(
			slides.map((slide) => {
				let rSlide = RSlide.create(
					slide.width,
					slide.height,
					slide.layers.map((layer) => {
						if (layer.type == "image") {
							return RImageLayer.create((layer as ImageLayer).imageId, layer.transform, layer.id);
						} else if (layer.type == "text") {
							return RTextLayer.create((layer as TextLayer).text, layer.transform, layer.id);
						} else {
							return {} as any;
						}
					})
				);

				return rSlide;
			})
		);
	}, [slides]);

	return (
		<SlideList
      mode={mode}
      slides={slidesState}
      setSlides={setSlidesState}
      selectedSlide={selectedSlide}
      setSelectedSlide={setSelectedSlide} setMode={function (value: SetStateAction<ViewerMode>): void {
        throw new Error("Function not implemented.");
      } }></SlideList>
	);
};
