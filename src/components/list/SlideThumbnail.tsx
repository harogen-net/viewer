import { useCallback, useEffect, useState } from "react";
import { Slide } from "../../model/Slide";
import { CanvasSlideView } from "../slide/CanvasSlideView";
import { useExtendableTimeout } from "../../hooks/useExtendableTimer";
import classNames from "classnames";

export const SlideThumbnail: React.FC<{
  slide: Slide;
  updateSlide: (id: string, updatedSlide: Partial<Slide>) => void;
  mode: "view" | "edit";
  scale: number;
  onSelect: (slide: Slide) => void;
  onEdit: (slide: Slide) => void;
  onDelete: (slide: Slide) => void;
  onClone: (slide: Slide) => void;
  onContextMenu: (slide: Slide, x: number, y: number) => void;
}> = ({ slide, updateSlide, mode, scale, onSelect, onEdit, onDelete, onClone, onContextMenu }) => {
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

    let nextDuration = slide.durationRatio;
    if (direction) {
      if (slide.durationRatio > 0.2) {
        if (slide.durationRatio > 2) {
          nextDuration -= 1;
        } else if (slide.durationRatio > 1) {
          nextDuration -= 0.5;
        } else {
          nextDuration -= 0.2;
        }
      }
    } else {
      if (slide.durationRatio < 9) {
        if (slide.durationRatio >= 2) {
          nextDuration += 1;
        } else if (slide.durationRatio >= 1) {
          nextDuration += 0.5;
        } else {
          nextDuration += 0.2;
        }
      }
    }

    updateSlide(slide.uuid, { durationRatio: nextDuration });
  };

  var durationCorrection: number = Math.atan(slide.durationRatio - 1) * 0.5 + 1;
  if (slide.durationRatio < 1) {
    durationCorrection = Math.pow(slide.durationRatio, 0.4);
  }
  var fitWidth = Math.round(scale * slide.width * durationCorrection);

  return (
    <div
      onClick={() => onSelect(slide)}
      onDoubleClick={doubleClickHandler}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(slide, e.clientX, e.clientY);
      }}
      style={{ width: fitWidth }}
      className={classNames(slide.disabled ? "disabled" : "", slide.joining ? "joining" : "")}
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

          updateSlide(slide.uuid, { joining: !slide.joining });
        }}
      ></div>
      <input
        className="enableCheck"
        type="checkbox"
        checked={!slide.disabled}
        onChange={() => {
          updateSlide(slide.uuid, { disabled: !slide.disabled });
        }}
      />
      <CanvasSlideView slide={slide} scale={scale} />
    </div>
  );
};
