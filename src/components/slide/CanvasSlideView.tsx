import { useEffect, useRef } from "react";
import { RSlide } from "../../model/Slide";
import { SlideToPNGConverter } from "../../utils/SlideToPNGConverter";
import { useDebounce } from "use-debounce";

export const CanvasSlideView: React.FC<{
  slide: RSlide;
  scale: number;
}> = ({ slide, scale }) => {
  const [debouncedSlide] = useDebounce(slide, 100);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const converter = new SlideToPNGConverter();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    converter.drawSlide2Canvas(slide, canvas, scale);
  }, [debouncedSlide]);

  const witdh = Math.round(slide.width * scale);
  const height = Math.round(slide.height * scale);

  return <canvas ref={canvasRef} width={witdh} height={height}></canvas>;
};
