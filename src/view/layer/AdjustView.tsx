import { Matrix4 } from "matrixgl";
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
	type Ref,
} from "react";
import { PropertyEvent } from "../../events/PropertyEvent";
import { PropFlags } from "../../model/PropFlags";
import { Slide } from "../../model/Slide";
import { Command, HistoryManager } from "../../utils/HistoryManager";
import { KeyboardManager } from "../../utils/KeyboardManager";
import { LayerView } from "../LayerView";

type AdjustHandleKey = "ne" | "nw" | "se" | "sw";

export type AdjustViewHandle = {
	readonly isDrag: boolean;
	startDrag: (event: MouseEvent) => void;
	base_scale: number;
	targetLayerView: LayerView | null;
};

type AdjustViewProps = {
	ref?: Ref<AdjustViewHandle>;
};

type AdjustViewComponentProps = {
	anchorStyle: CSSProperties;
	frameStyle: CSSProperties;
	onAnchorMouseDown: (key: AdjustHandleKey, event: ReactMouseEvent<HTMLDivElement>) => void;
	onFrameMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

const ENFORCE_ASPECT_RATIO = true;
const transformFlags =
	PropFlags.X |
	PropFlags.Y |
	PropFlags.SCALE_X |
	PropFlags.SCALE_Y |
	PropFlags.ROTATION |
	PropFlags.MIRROR_H |
	PropFlags.MIRROR_V;

const finiteNonZero = (value: number, fallback: number = 1): number => {
	return Number.isFinite(value) && Math.abs(value) > Number.EPSILON ? value : fallback;
};

const positiveFiniteNonZero = (value: number, fallback: number = 1): number => {
	return finiteNonZero(Math.abs(value), fallback);
};

const positiveFiniteOrZero = (value: number): number => {
	return Number.isFinite(value) && value > Number.EPSILON ? value : 0;
};

export const AdjustViewComponent = ({
	anchorStyle,
	frameStyle,
	onAnchorMouseDown,
	onFrameMouseDown,
}: AdjustViewComponentProps) => {
	return (
		<div className="controls">
			<div className="frame" style={frameStyle} onMouseDown={onFrameMouseDown} />
			<div
				className="anchor ne"
				style={anchorStyle}
				onMouseDown={(event) => onAnchorMouseDown("ne", event)}
			/>
			<div
				className="anchor nw"
				style={anchorStyle}
				onMouseDown={(event) => onAnchorMouseDown("nw", event)}
			/>
			<div
				className="anchor se"
				style={anchorStyle}
				onMouseDown={(event) => onAnchorMouseDown("se", event)}
			/>
			<div
				className="anchor sw"
				style={anchorStyle}
				onMouseDown={(event) => onAnchorMouseDown("sw", event)}
			/>
		</div>
	);
};

export const AdjustView = ({ ref }: AdjustViewProps) => {
	const baseScaleRef = useRef(1);
	const targetLayerViewRef = useRef<LayerView | null>(null);
	const dataRef = useRef<LayerView["data"] | null>(null);
	const isDragRef = useRef(false);
	const dragMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
	const dragUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
	const scaleMoveHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
	const scaleUpHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);
	const [anchorStyle, setAnchorStyle] = useState<CSSProperties>({});
	const [frameStyle, setFrameStyle] = useState<CSSProperties>({});
	const [wrapperClassName, setWrapperClassName] = useState("layerWrapper");
	const [wrapperStyle, setWrapperStyle] = useState<CSSProperties>({
		display: "none",
		zIndex: Slide.LAYER_NUM_MAX + 1,
	});

	const clearDragListeners = useCallback(() => {
		if (dragMoveHandlerRef.current) {
			document.removeEventListener("mousemove", dragMoveHandlerRef.current);
			dragMoveHandlerRef.current = null;
		}
		if (dragUpHandlerRef.current) {
			document.removeEventListener("mouseup", dragUpHandlerRef.current);
			dragUpHandlerRef.current = null;
		}
	}, []);

	const clearScaleListeners = useCallback(() => {
		if (scaleMoveHandlerRef.current) {
			document.removeEventListener("mousemove", scaleMoveHandlerRef.current);
			scaleMoveHandlerRef.current = null;
		}
		if (scaleUpHandlerRef.current) {
			document.removeEventListener("mouseup", scaleUpHandlerRef.current);
			scaleUpHandlerRef.current = null;
		}
	}, []);

	const setVisible = useCallback((value: boolean) => {
		setWrapperStyle((current) => ({ ...current, display: value ? "" : "none" }));
	}, []);

	const updateHostSize = useCallback(() => {
		const targetLayerView = targetLayerViewRef.current;
		const data = targetLayerView?.data;
		if (!targetLayerView || !data) return;
		const width =
			positiveFiniteOrZero(data.originWidth) ||
			positiveFiniteOrZero(targetLayerView.width) ||
			positiveFiniteOrZero(targetLayerView.element.offsetWidth) ||
			1;
		const height =
			positiveFiniteOrZero(data.originHeight) ||
			positiveFiniteOrZero(targetLayerView.height) ||
			positiveFiniteOrZero(targetLayerView.element.offsetHeight) ||
			1;
		setWrapperStyle((current) => ({
			...current,
			width: width + "px",
			height: height + "px",
		}));
	}, []);

	const getScaleOriginSize = useCallback(() => {
		const targetLayerView = targetLayerViewRef.current;
		const data = dataRef.current;
		return {
			width:
				positiveFiniteOrZero(data?.originWidth ?? 0) ||
				positiveFiniteOrZero(targetLayerView?.width ?? 0) ||
				positiveFiniteOrZero(targetLayerView?.element.offsetWidth ?? 0) ||
				1,
			height:
				positiveFiniteOrZero(data?.originHeight ?? 0) ||
				positiveFiniteOrZero(targetLayerView?.height ?? 0) ||
				positiveFiniteOrZero(targetLayerView?.element.offsetHeight ?? 0) ||
				1,
		};
	}, []);

	const updateUISize = useCallback(() => {
		const data = dataRef.current;
		if (!data) return;

		const scaleX = positiveFiniteNonZero(data.scaleX * baseScaleRef.current);
		const scaleY = positiveFiniteNonZero(data.scaleY * baseScaleRef.current);
		const anchorSizeX = 16 / scaleX;
		const anchorSizeY = 16 / scaleY;
		setAnchorStyle({ width: anchorSizeX, height: anchorSizeY });

		const borderSizeH = 3 / scaleX + "px";
		const borderSizeV = 3 / scaleY + "px";
		setFrameStyle({ borderWidth: borderSizeV + " " + borderSizeH });
	}, []);

	const updateMatrix = useCallback(() => {
		const data = dataRef.current;
		if (!data) return;

		const matrix = data.matrix;
		setWrapperStyle((current) => ({ ...current, transform: "matrix(" + matrix.join(",") + ")" }));
		updateUISize();
	}, [updateUISize]);

	const updateView = useCallback(
		(flag: number = PropFlags.ALL) => {
			const data = dataRef.current;
			if (!data) return;

			setWrapperClassName(
				["layerWrapper", data.visible ? "" : "invisible", data.locked ? "locked" : ""]
					.filter(Boolean)
					.join(" ")
			);

			if (flag & PropFlags.LOCKED) {
				setVisible(!data.locked);
			}
			if (flag & PropFlags.IMG_IMAGEID) {
				updateHostSize();
				updateMatrix();
			}
			if (flag & PropFlags.TXT_TEXT) {
				setTimeout(() => {
					if (targetLayerViewRef.current?.data) {
						updateHostSize();
						updateUISize();
					}
				}, 1);
			}
			if (flag & transformFlags) {
				if (flag & (PropFlags.SCALE_X | PropFlags.SCALE_Y)) updateHostSize();
				updateMatrix();
			}
		},
		[setVisible, updateHostSize, updateMatrix, updateUISize]
	);

	const onLayerUpdate = useCallback(
		(event: PropertyEvent) => {
			updateView(event.propFlags);
		},
		[updateView]
	);

	const setBaseScale = useCallback(
		(value: number) => {
			baseScaleRef.current = finiteNonZero(value);
			updateUISize();
		},
		[updateUISize]
	);

	const setTargetLayerView = useCallback(
		(value: LayerView | null) => {
			if (isDragRef.current) return;
			if (dataRef.current) {
				dataRef.current.removeEventListener(PropertyEvent.UPDATE, onLayerUpdate);
			}

			targetLayerViewRef.current = value;

			if (targetLayerViewRef.current) {
				dataRef.current = targetLayerViewRef.current.data;
				dataRef.current.addEventListener(PropertyEvent.UPDATE, onLayerUpdate);
				updateHostSize();
				updateView();
				setVisible(!dataRef.current.locked);
				requestAnimationFrame(() => {
					if (targetLayerViewRef.current !== value) return;
					updateHostSize();
					updateMatrix();
				});
			} else {
				dataRef.current = null;
				setVisible(false);
			}
		},
		[onLayerUpdate, setVisible, updateHostSize, updateView]
	);

	const startDrag = useCallback(
		(event: MouseEvent) => {
			const data = dataRef.current;
			if (!data) return;
			if (data.locked) return;

			isDragRef.current = true;
			let mouseX = event.screenX;
			let mouseY = event.screenY;
			const layer = data;
			const initPos = { x: layer.x, y: layer.y };
			const endPos = { x: initPos.x, y: initPos.y };

			clearDragListeners();
			dragMoveHandlerRef.current = (moveEvent: MouseEvent) => {
				if (!targetLayerViewRef.current) return;
				if (!isDragRef.current) return;
				const baseScale = finiteNonZero(baseScaleRef.current);

				layer.moveBy(
					(moveEvent.screenX - mouseX) / baseScale,
					(moveEvent.screenY - mouseY) / baseScale
				);
				mouseX = moveEvent.screenX;
				mouseY = moveEvent.screenY;
			};
			dragUpHandlerRef.current = () => {
				if (!targetLayerViewRef.current) return;
				if (!isDragRef.current) return;

				isDragRef.current = false;
				clearDragListeners();

				endPos.x = layer.x;
				endPos.y = layer.y;
				if (initPos.x != endPos.x || initPos.y != endPos.y) {
					HistoryManager.shared.record(
						new Command(
							() => {
								layer.x = endPos.x;
								layer.y = endPos.y;
							},
							() => {
								layer.x = initPos.x;
								layer.y = initPos.y;
							}
						)
					);
				}
			};
			document.addEventListener("mousemove", dragMoveHandlerRef.current);
			document.addEventListener("mouseup", dragUpHandlerRef.current);
		},
		[clearDragListeners]
	);

	const startScale = useCallback(
		(event: MouseEvent, key: AdjustHandleKey) => {
			const data = dataRef.current;
			if (!data) return;
			if (data.locked) return;

			isDragRef.current = true;
			const mouseX = event.screenX;
			const mouseY = event.screenY;
			const originSize = getScaleOriginSize();
			const originHalfWidth = finiteNonZero(originSize.width / 2);
			const originHalfHeight = finiteNonZero(originSize.height / 2);
			const controlX = originHalfWidth * data.scaleX;
			const controlY = originHalfHeight * data.scaleY;
			const layer = data;
			const initScale = { x: layer.scaleX, y: layer.scaleY };
			const endScale = { x: initScale.x, y: initScale.y };

			clearScaleListeners();
			scaleMoveHandlerRef.current = (moveEvent: MouseEvent) => {
				if (!isDragRef.current) return;

				const defX = moveEvent.screenX - mouseX;
				const defY = moveEvent.screenY - mouseY;
				const baseScale = finiteNonZero(baseScaleRef.current);
				const mat = Matrix4.identity()
					.scale(1 / baseScale, 1 / baseScale, 1)
					.rotateZ((-layer.rotation * Math.PI) / 180)
					.translate(defX, defY, 0);
				const defX2 = mat.values[12];
				const defY2 = mat.values[13];

				let xDirection = 1;
				let yDirection = 1;
				if (key.indexOf("e") == -1) xDirection *= -1;
				if (key.indexOf("s") == -1) yDirection *= -1;
				if (layer.mirrorH) xDirection *= -1;
				if (layer.mirrorV) yDirection *= -1;

				const scaleX = (controlX + defX2 * xDirection) / originHalfWidth;
				const scaleY = (controlY + defY2 * yDirection) / originHalfHeight;

				if (KeyboardManager.isDown(16) || ENFORCE_ASPECT_RATIO) {
					layer.scale = finiteNonZero(Math.min(scaleX, scaleY));
				} else {
					layer.scaleX = finiteNonZero(scaleX);
					layer.scaleY = finiteNonZero(scaleY);
				}
			};
			scaleUpHandlerRef.current = () => {
				if (!dataRef.current) return;
				if (dataRef.current.locked) return;
				if (!isDragRef.current) return;
				isDragRef.current = false;
				clearScaleListeners();

				endScale.x = layer.scaleX;
				endScale.y = layer.scaleY;
				if (initScale.x != endScale.x || initScale.y != endScale.y) {
					HistoryManager.shared.record(
						new Command(
							() => {
								layer.scaleX = endScale.x;
								layer.scaleY = endScale.y;
							},
							() => {
								layer.scaleX = initScale.x;
								layer.scaleY = initScale.y;
							}
						)
					);
				}
			};
			document.addEventListener("mousemove", scaleMoveHandlerRef.current);
			document.addEventListener("mouseup", scaleUpHandlerRef.current);
		},
		[clearScaleListeners, getScaleOriginSize]
	);

	const handleAnchorMouseDown = useCallback(
		(key: AdjustHandleKey, event: ReactMouseEvent<HTMLDivElement>) => {
			startScale(event.nativeEvent, key);
			event.stopPropagation();
			event.nativeEvent.stopImmediatePropagation();
		},
		[startScale]
	);

	const handleFrameMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			startDrag(event.nativeEvent);
			event.stopPropagation();
			event.nativeEvent.stopImmediatePropagation();
		},
		[startDrag]
	);

	useImperativeHandle(
		ref,
		() => ({
			get isDrag() {
				return isDragRef.current;
			},
			startDrag,
			get base_scale() {
				return baseScaleRef.current;
			},
			set base_scale(value: number) {
				setBaseScale(value);
			},
			get targetLayerView() {
				return targetLayerViewRef.current;
			},
			set targetLayerView(value: LayerView | null) {
				setTargetLayerView(value);
			},
		}),
		[startDrag, setBaseScale, setTargetLayerView]
	);

	useEffect(() => {
		return () => {
			if (dataRef.current) {
				dataRef.current.removeEventListener(PropertyEvent.UPDATE, onLayerUpdate);
			}
			clearDragListeners();
			clearScaleListeners();
		};
	}, [clearDragListeners, clearScaleListeners, onLayerUpdate]);

	return (
		<div className={wrapperClassName} style={wrapperStyle}>
			<AdjustViewComponent
				anchorStyle={anchorStyle}
				frameStyle={frameStyle}
				onAnchorMouseDown={handleAnchorMouseDown}
				onFrameMouseDown={handleFrameMouseDown}
			/>
		</div>
	);
};
