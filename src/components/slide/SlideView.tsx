import { useEffect, useState } from "react";
import { Slide } from "../../model/Slide";
import { PropertyEvent } from "../../events/PropertyEvent";

export const SlideView: React.FC<{
  slide: Slide;
  isSelected: boolean;
}> = ({ slide }) => {
  const [slideState, setSetSlideState] = useState(slide);

  useEffect(() => {
    slide.addEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
    return () => {
      slide.removeEventListener(PropertyEvent.UPDATE, onSlideUpdateLambda);
    };
  }, [slide]);
  
  const onSlideUpdateLambda = () => {
    setSetSlideState(slide);
  };

  return <></>;
};
