import { useState, useEffect, SetStateAction } from "react";
import { Slide, RSlide } from "../../model/Slide";
import { ViewerMode } from "../../Viewer";
import { SlideList } from "./SlideList";

export const SlideVCWrapper: React.FC<{
  mode: ViewerMode;
  slides: Slide[];
}> = ({ mode, slides }) => {
  const [slidesState, setSlidesState] = useState<RSlide[]>(slides.map((slide) => RSlide.fromSlide(slide)));
  const [selectedSlide, setSelectedSlide] = useState<RSlide | undefined>();

  useEffect(() => {
    setSlidesState(slides.map((slide) => RSlide.fromSlide(slide)));
  }, [slides]);

  return <SlideList mode={mode} slides={slidesState} setSlides={setSlidesState} selectedSlide={selectedSlide} setSelectedSlide={setSelectedSlide}></SlideList>;
};
