import React, { useEffect, useState } from "react";
import { RSlide, Slide } from "../../model/Slide";
import { SlideThumbnail } from "./SlideThumbnail";
import { produce } from "immer";
import { ViewerMode } from "../../Viewer";
import { set } from "rsuite/esm/internals/utils/date";

export const SlideList: React.FC<{
  mode: ViewerMode;
  slides: RSlide[];
  setSlides: React.Dispatch<React.SetStateAction<RSlide[]>>;
  selectedSlide: RSlide | undefined;
  setSelectedSlide: React.Dispatch<React.SetStateAction<RSlide | undefined>>;
}> = ({ mode, slides, setSlides, selectedSlide, setSelectedSlide }) => {
  const THUMBNAIL_HEIGHT = 100;

  const containerRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) {
      $(containerRef.current).sortable({
        items: ".slide",
        revert: 200,
        scroll: false,
        distance: 10,
        cursor: "move",
        tolerance: "pointer",
        //helper:"clone",
        forcePlaceholderSize: true,
        forceHelperSize: true,
        update: () => {
          // this.onSlideSort();
        },
      });
    }
  }, [containerRef]);

  return (
    <div
    ref={containerRef}
    className="rounded-lg bg-gray-400 flex gap-2 p-4 shadow-inner"
    >
      {slides.map((slide, index) => (
        <SlideThumbnail
          key={index}
          slide={slide}
          updateSlide={(uuid: string, updatedSlide: Partial<Slide>) => {
            setSlides((prev) =>
              produce(prev, (draft) => {
                const slide = draft.find((c) => c.uuid === uuid);
                if (slide) {
                  Object.assign(slide, updatedSlide);
                }
              })
            );
          }}
          mode={mode}
          scale={THUMBNAIL_HEIGHT / slide.height || 1}
          onSelect={(slide) => {
            setSelectedSlide(slide);
          }}
          onEdit={function (slide: RSlide): void {
            setSelectedSlide(slide);

            // throw new Error("Function not implemented.");
          }}
          onDelete={function (slide: RSlide): void {
            setSlides((prev) => prev.filter((c) => c.uuid !== slide.uuid));
          }}
          onClone={(slide: RSlide) => {
            setSlides((prev) => {
              const index = prev.findIndex((c) => c.uuid === slide.uuid);
              const newSlide = { ...slide, uuid: Math.random().toString() };
              prev.splice(index + 1, 0, newSlide);
              return [...prev];
            });
          }}
          onContextMenu={function (slide: RSlide, x: number, y: number): void {
            throw new Error("Function not implemented.");
          }}
        />
      ))}
    </div>
  );
};
