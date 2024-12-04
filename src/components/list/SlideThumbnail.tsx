import { useCallback, useEffect, useState } from "react";
import { Slide } from "../../model/Slide";
import { CanvasSlideView } from "../slide/CanvasSlideView";
import { useDebounce } from "use-debounce";
import { useExtendableTimeout } from "../../hooks/useExtendableTimer";
import { set } from "rsuite/esm/internals/utils/date";
import { PropertyEvent } from "../../events/PropertyEvent";

export const SlideThumbnail: React.FC<{
  slide: Slide;
  mode: "view" | "edit";
  onEdit: (slide: Slide) => void;
  onDelete: (slide: Slide) => void;
  onClone: (slide: Slide) => void;
  onContextMenu: (slide: Slide, x: number, y: number) => void;
}> = ({ slide, mode, onEdit, onDelete, onClone, onContextMenu }) => {
  const [slideState, setSlideState] = useState(slide);
  const [dblClickLock, setDblClickLock] = useState(false);
  const [setTimeout] = useExtendableTimeout();

  const durationStr = slide.durationRatio !== 1 ? "x" + slide.durationRatio.toString().substring(0, 3) : "";

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

  const durationHandler = (direction: boolean) => {
    lockDoubleClick();

    if (direction) {
      if (slide.durationRatio > 0.2) {
        if (slide.durationRatio > 2) {
          slide.durationRatio -= 1;
        } else if (slide.durationRatio > 1) {
          slide.durationRatio -= 0.5;
        } else {
          slide.durationRatio -= 0.2;
        }
      }
    } else {
      if (slide.durationRatio < 9) {
        if (slide.durationRatio >= 2) {
          slide.durationRatio += 1;
        } else if (slide.durationRatio >= 1) {
          slide.durationRatio += 0.5;
        } else {
          slide.durationRatio += 0.2;
        }
      }
    }
  };

  return (
    <div
      onDoubleClick={doubleClickHandler}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(slide, e.clientX, e.clientY);
      }}
    >
      {mode === "edit" && (
        <>
          <button className="delete" onClick={() => onDelete(slide)}>
            <i className="fas fa-times"></i>
          </button>
          <button className="clone" onClick={() => onClone(slide)}>
            <i className="fas fa-plus"></i>
          </button>
          <button className="edit" onClick={() => onDelete(slide)}>
            <i className="fas fa-edit"></i>
          </button>
        </>
      )}
      <div className="duration">
        <button className="down" onClick={() => durationHandler(false)}>
          -
        </button>
        <span>{durationStr}</span>
        <button className="up" onClick={() => durationHandler(true)}>
          +
        </button>
      </div>
      <div
        className="joinArrow"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          slide.joining = !slide.joining;
        }}
      ></div>
      <CanvasSlideView slide={slide} scale={0.5} />
    </div>
  );
};
