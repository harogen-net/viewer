import { useEffect, useRef, useState } from "react";
import { Slide } from "../../model/Slide";
import { PropertyEvent } from "../../events/PropertyEvent";
import { SlideToPNGConverter } from "../../utils/SlideToPNGConverter";
import { set } from "rsuite/esm/internals/utils/date";
import { useDebounce } from "use-debounce";

export const CanvasSlideView: React.FC<{
  slide: Slide;
  scale: number;
}> = ({ slide, scale }) => {
  const [slideState, setSetSlideState] = useState(slide);
  const [debouncedSlide] = useDebounce(slideState, 100);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const converter = new SlideToPNGConverter();

  useEffect(() => {
    slide.addEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
    return () => {
      slide.removeEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
    };
  }, [slide]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    converter.drawSlide2Canvas(slideState, canvas, scale);
  }, [debouncedSlide]);

  const witdh = Math.round(slide.width * scale);
  const height = Math.round(slide.height * scale);

  const onSlideUpdateLambda = () => {
    setSetSlideState(slide);
  };

  return (
    <>
      <canvas ref={canvasRef} width={witdh} height={height}></canvas>
    </>
  );
};
