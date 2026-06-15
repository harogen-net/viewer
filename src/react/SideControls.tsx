import React, { useEffect, useRef, useState } from "react";
import { ViewerCommands } from "../bridge/ViewerCommands";
import { useViewerEditLayerState, useViewerEditLayers, useViewerMode } from "../bridge/useViewerBridge";
import { getLayerListDropAction, getLayerListKeyboardAction } from "./layerListKeyboard";
import {
    type ClipSide,
    getAdjustedClipValues,
    getAdjustedNumericValue,
    getClipValuesFromInputs,
    getInputStep,
    getWheelInputDelta,
} from "./numericInput";

type EditGateProps = {
    canEdit?: boolean;
};

export function CopyPasteControls({ canEdit = true }: EditGateProps) {
	const { hasSelection } = useViewerEditLayerState();
	const { mode } = useViewerMode();
    const canEditLayer = canEdit && mode === "edit" && hasSelection;

    return (
        <>
            <button
                className="copyTrans"
                data-react-controlled="true"
                title="変形をコピー"
                disabled={!canEditLayer}
                onClick={() => ViewerCommands.copySelectedLayerTransform()}>
                <i className="fas fa-clipboard"></i>
            </button>
            <button
                className="pasteTrans"
                data-react-controlled="true"
                title="変形をペースト"
                disabled={!canEditLayer}
                onClick={() => ViewerCommands.pasteLayerTransform()}>
                <i className="far fa-clipboard"></i>
            </button>
        </>
    );
}

export function SwapControls({ canEdit = true }: EditGateProps) {
	const { hasSelection } = useViewerEditLayerState();
	const { mode } = useViewerMode();
    const canEditLayer = canEdit && mode === "edit" && hasSelection;

    return (
        <>
            <button
                className="bottom"
                data-react-controlled="true"
                disabled={!canEditLayer}
                onClick={() => ViewerCommands.moveSelectedLayerToBottom()}>
                <i className="fas fa-arrow-circle-down"></i>
            </button>
            <button
                className="down"
                data-react-controlled="true"
                disabled={!canEditLayer}
                onClick={() => ViewerCommands.moveSelectedLayerDown()}>
                <i className="fas fa-arrow-down"></i>
            </button>
            <button
                className="up"
                data-react-controlled="true"
                disabled={!canEditLayer}
                onClick={() => ViewerCommands.moveSelectedLayerUp()}>
                <i className="fas fa-arrow-up"></i>
            </button>
            <button
                className="top"
                data-react-controlled="true"
                disabled={!canEditLayer}
                onClick={() => ViewerCommands.moveSelectedLayerToTop()}>
                <i className="fas fa-arrow-circle-up"></i>
            </button>
        </>
    );
}

export function ImageRefControls({ canEdit = true }: EditGateProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [replaceForAll, setReplaceForAll] = useState(false);
	const { hasSelection, layerType } = useViewerEditLayerState();
	const { mode } = useViewerMode();
    const canEditLayer = canEdit && mode === "edit" && hasSelection;
	const isImageLayer = layerType === "image";

	const openPicker = () => {
		if (!canEditLayer || !isImageLayer) return;
		inputRef.current?.click();
	};

	const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.currentTarget.files?.[0];
		if (file) {
			ViewerCommands.replaceSelectedImage(file, replaceForAll);
		}
		e.currentTarget.value = "";
	};

	return (
		<>
			<button
				className="imageRef"
				data-react-controlled="true"
				disabled={!canEditLayer || !isImageLayer}
				onClick={openPicker}>
				<span>
					<i className="fas fa-file-image"></i> IMG REF.
				</span>{" "}
			</button>
			<label htmlFor="cb_imageRef" data-react-controlled="true">
				<input
					id="cb_imageRef"
					type="checkbox"
					data-react-controlled="true"
					checked={replaceForAll}
					onChange={(e) => setReplaceForAll(e.currentTarget.checked)}
					disabled={!canEditLayer || !isImageLayer}
				/>
				<span>forALL</span>
			</label>
			<input
				ref={inputRef}
				className="imageRef"
				type="file"
				accept="image/*"
				data-react-controlled="true"
				onChange={onFileChange}
				style={{ display: "none" }}
			/>
			<button
				className="download"
				data-react-controlled="true"
				disabled={!canEditLayer || !isImageLayer}
				onClick={() => ViewerCommands.downloadSelectedImage()}>
				<i className="fas fa-file-download"></i>
			</button>
		</>
	);
}

export function TextEditControls({ canEdit = true }: EditGateProps) {
    const { hasSelection, layerType, textContent } = useViewerEditLayerState();
    const { mode } = useViewerMode();
    const canEditLayer = canEdit && mode === "edit" && hasSelection;
    const isTextLayer = layerType === "text";
    const [textInput, setTextInput] = useState("");

    useEffect(() => {
        setTextInput(textContent ?? "");
    }, [textContent]);

    const applyTextContent = () => {
        if (!canEditLayer || !isTextLayer) return;
        ViewerCommands.setSelectedLayerText(textInput);
    };

    return (
        <textarea
            spellCheck={false}
            value={textInput}
            onChange={(e) => setTextInput(e.currentTarget.value)}
            onBlur={applyTextContent}
            disabled={!canEditLayer || !isTextLayer}
            data-react-controlled="true"
            style={{ width: "100%", fontSize: "12px" }}
        />
    );
}

export function PropertyControls({ canEdit = true }: EditGateProps) {
    const {
        hasSelection,
        layerType,
        x,
        y,
        scale,
        rotation,
        opacity,
        clipTop,
        clipRight,
        clipBottom,
        clipLeft,
        mirrorH,
        mirrorV,
        isText,
    } = useViewerEditLayerState();
    const { mode } = useViewerMode();
    const canEditLayer = canEdit && mode === "edit" && hasSelection;
    const isImageLayer = layerType === "image";
    const [positionXInput, setPositionXInput] = useState("0");
    const [positionYInput, setPositionYInput] = useState("0");
    const [scaleInput, setScaleInput] = useState("1");
    const [rotationInput, setRotationInput] = useState("0");
    const [opacityInput, setOpacityInput] = useState("1");
    const [clipTopInput, setClipTopInput] = useState("0");
    const [clipRightInput, setClipRightInput] = useState("0");
    const [clipBottomInput, setClipBottomInput] = useState("0");
    const [clipLeftInput, setClipLeftInput] = useState("0");

    useEffect(() => {
        setPositionXInput(String(x ?? 0));
        setPositionYInput(String(y ?? 0));
        setScaleInput(String(scale ?? 1));
        setRotationInput(String(rotation ?? 0));
        setOpacityInput(String(opacity ?? 1));
        setClipTopInput(String(clipTop ?? 0));
        setClipRightInput(String(clipRight ?? 0));
        setClipBottomInput(String(clipBottom ?? 0));
        setClipLeftInput(String(clipLeft ?? 0));
    }, [x, y, scale, rotation, opacity, clipTop, clipRight, clipBottom, clipLeft]);

    const applyPosition = () => {
        if (!canEditLayer) return;
        const nextX = Number(positionXInput);
        const nextY = Number(positionYInput);
        if (!isFinite(nextX) || !isFinite(nextY)) return;
        ViewerCommands.setSelectedLayerPosition(nextX, nextY);
    };

    const adjustPositionX = (delta: number) => {
        if (!canEditLayer) return;
        const nextX = getAdjustedNumericValue(positionXInput, x ?? 0, delta);
        const nextY = Number(positionYInput);
        const appliedY = Number.isFinite(nextY) ? nextY : y ?? 0;
        setPositionXInput(String(nextX));
        ViewerCommands.setSelectedLayerPosition(nextX, appliedY);
    };

    const adjustPositionY = (delta: number) => {
        if (!canEditLayer) return;
        const nextY = getAdjustedNumericValue(positionYInput, y ?? 0, delta);
        const nextX = Number(positionXInput);
        const appliedX = Number.isFinite(nextX) ? nextX : x ?? 0;
        setPositionYInput(String(nextY));
        ViewerCommands.setSelectedLayerPosition(appliedX, nextY);
    };

    const applyScale = () => {
        if (!canEditLayer) return;
        const nextScale = Number(scaleInput);
        if (!isFinite(nextScale) || nextScale <= 0) return;
        ViewerCommands.setSelectedLayerScale(nextScale);
    };

    const adjustScale = (delta: number) => {
        if (!canEditLayer) return;
        const nextScale = getAdjustedNumericValue(scaleInput, scale ?? 1, delta, { min: 0.01 });
        setScaleInput(String(nextScale));
        ViewerCommands.setSelectedLayerScale(nextScale);
    };

    const applyRotation = () => {
        if (!canEditLayer) return;
        const nextRotation = Number(rotationInput);
        if (!isFinite(nextRotation)) return;
        ViewerCommands.setSelectedLayerRotation(nextRotation);
    };

    const adjustRotation = (delta: number) => {
        if (!canEditLayer) return;
        const nextRotation = getAdjustedNumericValue(rotationInput, rotation ?? 0, delta);
        setRotationInput(String(nextRotation));
        ViewerCommands.setSelectedLayerRotation(nextRotation);
    };

    const applyOpacity = () => {
        if (!canEditLayer) return;
        const nextOpacity = Number(opacityInput);
        if (!isFinite(nextOpacity)) return;
        ViewerCommands.setSelectedLayerOpacity(nextOpacity);
    };

    const adjustOpacity = (delta: number) => {
        if (!canEditLayer) return;
        const nextOpacity = getAdjustedNumericValue(opacityInput, opacity ?? 1, delta, { min: 0, max: 1 });
        setOpacityInput(String(nextOpacity));
        ViewerCommands.setSelectedLayerOpacity(nextOpacity);
    };

    const applyClip = () => {
        if (!canEditLayer || !isImageLayer) return;
        const next = getClipValuesFromInputs({
            top: clipTopInput,
            right: clipRightInput,
            bottom: clipBottomInput,
            left: clipLeftInput,
        });
        if (!next) return;
        ViewerCommands.setSelectedImageClip(next.top, next.right, next.bottom, next.left);
    };

    const adjustClip = (side: ClipSide, delta: number) => {
        if (!canEditLayer || !isImageLayer) return;
        const next = getAdjustedClipValues(
            {
                top: clipTopInput,
                right: clipRightInput,
                bottom: clipBottomInput,
                left: clipLeftInput,
            },
            {
                top: clipTop ?? 0,
                right: clipRight ?? 0,
                bottom: clipBottom ?? 0,
                left: clipLeft ?? 0,
            },
            side,
            delta
        );
        setClipTopInput(String(next.top));
        setClipRightInput(String(next.right));
        setClipBottomInput(String(next.bottom));
        setClipLeftInput(String(next.left));
        ViewerCommands.setSelectedImageClip(next.top, next.right, next.bottom, next.left);
    };

    const handleNumericKeyDown = (
        event: React.KeyboardEvent<HTMLInputElement>,
        adjustValue: (delta: number) => void,
        baseStep: number
    ) => {
        if (event.key === "Enter") {
            event.currentTarget.blur();
            return;
        }
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const direction = event.key === "ArrowUp" ? 1 : -1;
        adjustValue(getInputStep(baseStep, event) * direction);
    };

    const handleNumericWheel = (
        event: React.WheelEvent<HTMLInputElement>,
        adjustValue: (delta: number) => void,
        baseStep: number
    ) => {
        if (document.activeElement !== event.currentTarget) return;
        event.preventDefault();
        adjustValue(getWheelInputDelta(baseStep, event));
    };

    return (
        <>
            <dl className="position">
                <dt>position</dt>
                <dd>
                    <input
                        type="text"
                        value={positionXInput}
                        onChange={(e) => setPositionXInput(e.currentTarget.value)}
                        onBlur={applyPosition}
                        onKeyDown={(e) => handleNumericKeyDown(e, adjustPositionX, 1)}
                        onWheel={(e) => handleNumericWheel(e, adjustPositionX, 1)}
                        disabled={!canEditLayer}
                    />
                </dd>
                <dd>
                    <input
                        type="text"
                        value={positionYInput}
                        onChange={(e) => setPositionYInput(e.currentTarget.value)}
                        onBlur={applyPosition}
                        onKeyDown={(e) => handleNumericKeyDown(e, adjustPositionY, 1)}
                        onWheel={(e) => handleNumericWheel(e, adjustPositionY, 1)}
                        disabled={!canEditLayer}
                    />
                </dd>
            </dl>
            <dl className="scale">
                <dt>scale</dt>
                <dd>
                    <input
                        type="text"
                        value={scaleInput}
                        onChange={(e) => setScaleInput(e.currentTarget.value)}
                        onBlur={applyScale}
                        onKeyDown={(e) => handleNumericKeyDown(e, adjustScale, 0.05)}
                        onWheel={(e) => handleNumericWheel(e, adjustScale, 0.05)}
                        disabled={!canEditLayer}
                    />
                </dd>
                <dd>
                    <button
                        className={`mirrorH${mirrorH ? " on" : ""}`}
                        data-react-controlled="true"
                        data-desc="flip selected image horizontally"
                        title={mirrorH ? "unflip selected image horizontally" : "flip selected image horizontally"}
                        aria-pressed={!!mirrorH}
                        disabled={!canEditLayer}
                        onClick={() => ViewerCommands.toggleSelectedLayerMirrorH()}>
                        <i className="fas fa-arrows-alt-h"></i>
                    </button>
                    <button
                        className={`mirrorV${mirrorV ? " on" : ""}`}
                        data-react-controlled="true"
                        data-desc="flip selected image vertically"
                        title={mirrorV ? "unflip selected image vertically" : "flip selected image vertically"}
                        aria-pressed={!!mirrorV}
                        disabled={!canEditLayer}
                        onClick={() => ViewerCommands.toggleSelectedLayerMirrorV()}>
                        <i className="fas fa-arrows-alt-v"></i>
                    </button>
                </dd>
            </dl>
            <dl className="rotation">
                <dt>
                    rotation
                    <button
                        className="resetRotation"
                        data-react-controlled="true"
                        disabled={!canEditLayer}
                        onClick={() => ViewerCommands.resetSelectedLayerRotation()}>
                        <i className="fas fa-times"></i>
                    </button>
                </dt>
                <dd>
                    <input
                        type="text"
                        value={rotationInput}
                        onChange={(e) => setRotationInput(e.currentTarget.value)}
                        onBlur={applyRotation}
                        onKeyDown={(e) => handleNumericKeyDown(e, adjustRotation, 1)}
                        onWheel={(e) => handleNumericWheel(e, adjustRotation, 1)}
                        disabled={!canEditLayer}
                    />
                </dd>
            </dl>
            <dl className="opacity">
                <dt>
                    opacity
                    <button
                        className="resetOpacity"
                        data-react-controlled="true"
                        disabled={!canEditLayer}
                        onClick={() => ViewerCommands.resetSelectedLayerOpacity()}>
                        <i className="fas fa-times"></i>
                    </button>
                </dt>
                <dd>
                    <input
                        type="text"
                        value={opacityInput}
                        onChange={(e) => setOpacityInput(e.currentTarget.value)}
                        onBlur={applyOpacity}
                        onKeyDown={(e) => handleNumericKeyDown(e, adjustOpacity, 0.05)}
                        onWheel={(e) => handleNumericWheel(e, adjustOpacity, 0.05)}
                        disabled={!canEditLayer}
                    />
                </dd>
                <dd>
                    <button
                        className={`isText${isText ? " on" : ""}`}
                        data-react-controlled="true"
                        data-desc="this image contains text"
                        title={isText ? "mark image as non-text" : "mark image as text"}
                        aria-pressed={!!isText}
                        disabled={!canEditLayer || !isImageLayer}
                        onClick={() => ViewerCommands.toggleSelectedLayerIsText()}>
                        <i className="far fa-image"></i>
                        <i className="fas fa-font"></i>
                    </button>
                </dd>
            </dl>
            <dl className="clip">
                <dt>
                    clip
                    <button
                        className="resetClip"
                        data-react-controlled="true"
                        disabled={!canEditLayer || !isImageLayer}
                        onClick={() => ViewerCommands.resetSelectedImageClip()}>
                        <i className="fas fa-times"></i>
                    </button>
                </dt>
                <dd>
                    <input
                        type="text"
                        value={clipTopInput}
                        onChange={(e) => setClipTopInput(e.currentTarget.value)}
                        onBlur={applyClip}
                        onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("top", delta), 1)}
                        onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("top", delta), 1)}
                        disabled={!canEditLayer || !isImageLayer}
                    />
                </dd>
                <dd>
                    <input
                        type="text"
                        value={clipRightInput}
                        onChange={(e) => setClipRightInput(e.currentTarget.value)}
                        onBlur={applyClip}
                        onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("right", delta), 1)}
                        onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("right", delta), 1)}
                        disabled={!canEditLayer || !isImageLayer}
                    />
                </dd>
                <dd>
                    <input
                        type="text"
                        value={clipBottomInput}
                        onChange={(e) => setClipBottomInput(e.currentTarget.value)}
                        onBlur={applyClip}
                        onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("bottom", delta), 1)}
                        onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("bottom", delta), 1)}
                        disabled={!canEditLayer || !isImageLayer}
                    />
                </dd>
                <dd>
                    <input
                        type="text"
                        value={clipLeftInput}
                        onChange={(e) => setClipLeftInput(e.currentTarget.value)}
                        onBlur={applyClip}
                        onKeyDown={(e) => handleNumericKeyDown(e, (delta) => adjustClip("left", delta), 1)}
                        onWheel={(e) => handleNumericWheel(e, (delta) => adjustClip("left", delta), 1)}
                        disabled={!canEditLayer || !isImageLayer}
                    />
                </dd>
            </dl>
        </>
    );
}

export function LayerControls({ canEdit = true }: EditGateProps) {
    const { layers } = useViewerEditLayers();
    const { mode } = useViewerMode();
    const canEditLayers = canEdit && mode === "edit";
    const [renamingId, setRenamingId] = useState<number | null>(null);
    const [renameInput, setRenameInput] = useState("");
    const [draggingPosition, setDraggingPosition] = useState<number | null>(null);
    const [dropPosition, setDropPosition] = useState<number | null>(null);
    const pendingLayerFocusKey = useRef<string | null>(null);
    const layerItemRefs = useRef(new Map<string, HTMLLIElement>());
    const renameCanceledRef = useRef(false);

    const getLayerKey = (layer: (typeof layers)[number]) => String(layer.id);

    useEffect(() => {
        const focusKey = pendingLayerFocusKey.current;
        if (!focusKey) return;
        pendingLayerFocusKey.current = null;
        layerItemRefs.current.get(focusKey)?.focus();
    }, [layers]);

    const focusLayerAfterRender = (key: string | undefined) => {
        if (!key) return;
        pendingLayerFocusKey.current = key;
    };

    const handleSelectLayer = (index: number) => {
        if (!canEditLayers) return;
        ViewerCommands.selectEditLayerByIndex(index);
    };

    const handleToggleVisible = (index: number, event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!canEditLayers) return;
        ViewerCommands.selectEditLayerByIndex(index);
        ViewerCommands.toggleSelectedLayerVisible();
    };

    const handleToggleLocked = (index: number, event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!canEditLayers) return;
        ViewerCommands.selectEditLayerByIndex(index);
        ViewerCommands.toggleSelectedLayerLocked();
    };

    const handleToggleShared = (index: number, event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!canEditLayers) return;
        ViewerCommands.selectEditLayerByIndex(index);
        ViewerCommands.toggleSelectedLayerShared();
    };

    const handleDeleteLayer = (index: number, event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!canEditLayers) return;
        ViewerCommands.selectEditLayerByIndex(index);
        ViewerCommands.removeSelectedLayer();
    };

    const deleteLayerByIndex = (index: number) => {
        if (!canEditLayers) return;
        ViewerCommands.selectEditLayerByIndex(index);
        ViewerCommands.removeSelectedLayer();
    };

    const startRename = (id: number, currentName: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (!canEditLayers) return;
        startRenameLayer(id, currentName);
    };

    const startRenameLayer = (id: number, currentName: string) => {
        if (!canEditLayers) return;
        renameCanceledRef.current = false;
        setRenamingId(id);
        setRenameInput(currentName);
    };

    const handleLayerKeyDown = (
        layer: (typeof layers)[number],
        position: number,
        event: React.KeyboardEvent<HTMLLIElement>
    ) => {
        const action = getLayerListKeyboardAction({
            key: event.key,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            canEdit: canEditLayers,
            layerPosition: position,
            layerCount: layers.length,
        });
        if (action.preventDefault) {
            event.preventDefault();
        }

        switch (action.type) {
            case "select": {
                const nextLayer = layers[action.position];
                if (nextLayer) {
                    focusLayerAfterRender(getLayerKey(nextLayer));
                    ViewerCommands.selectEditLayerByIndex(nextLayer.index);
                }
                break;
            }
            case "rename":
                ViewerCommands.selectEditLayerByIndex(layer.index);
                startRenameLayer(layer.id, layer.name);
                break;
            case "move":
                focusLayerAfterRender(getLayerKey(layer));
                ViewerCommands.selectEditLayerByIndex(layer.index);
                if (action.direction < 0) {
                    ViewerCommands.moveSelectedLayerUp();
                } else {
                    ViewerCommands.moveSelectedLayerDown();
                }
                break;
            case "delete": {
                const nextLayer = layers[action.position + 1] ?? layers[action.position - 1];
                focusLayerAfterRender(nextLayer ? getLayerKey(nextLayer) : undefined);
                deleteLayerByIndex(layer.index);
                break;
            }
        }
    };

    const handleLayerDragStart = (position: number, event: React.DragEvent<HTMLLIElement>) => {
        if (!canEditLayers || layers.length < 2) return;
        setDraggingPosition(position);
        setDropPosition(position);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(position));
    };

    const handleLayerDragOver = (position: number, event: React.DragEvent<HTMLLIElement>) => {
        const action = getLayerListDropAction({
            canEdit: canEditLayers,
            fromPosition: draggingPosition,
            toPosition: position,
            layerCount: layers.length,
        });
        if (action.preventDefault) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropPosition(action.toPosition);
        }
    };

    const handleLayerDrop = (position: number, event: React.DragEvent<HTMLLIElement>) => {
        const action = getLayerListDropAction({
            canEdit: canEditLayers,
            fromPosition: draggingPosition,
            toPosition: position,
            layerCount: layers.length,
        });
        setDraggingPosition(null);
        setDropPosition(null);
        if (!action.preventDefault) return;
        event.preventDefault();
        const fromLayer = layers[action.fromPosition];
        const toLayer = layers[action.toPosition];
        if (!fromLayer || !toLayer) return;
        focusLayerAfterRender(getLayerKey(fromLayer));
        ViewerCommands.selectEditLayerByIndex(fromLayer.index);
        ViewerCommands.moveSelectedLayerToIndex(toLayer.index);
    };

    const handleLayerDragEnd = () => {
        setDraggingPosition(null);
        setDropPosition(null);
    };

    const commitRename = () => {
        if (renameCanceledRef.current) {
            renameCanceledRef.current = false;
            setRenamingId(null);
            return;
        }
        if (renamingId === null) return;
        const layer = layers.find((l) => l.id === renamingId);
        if (layer) {
            ViewerCommands.selectEditLayerByIndex(layer.index);
            ViewerCommands.setSelectedLayerName(renameInput);
            focusLayerAfterRender(getLayerKey(layer));
        }
        setRenamingId(null);
    };

    const getLayerLabel = (layer: (typeof layers)[number]) => {
        if (layer.name) return layer.name;
        return layer.type === "image" ? "イメージ" : layer.type;
    };

    return (
        <ul className="layerList" data-react-controlled="true">
            {layers.map((layer, position) => (
                <li
                    key={layer.id}
                    ref={(el) => {
                        const key = getLayerKey(layer);
                        if (el) layerItemRefs.current.set(key, el);
                        else layerItemRefs.current.delete(key);
                    }}
                    className={layer.selected ? "selected" : ""}
                    onClick={() => handleSelectLayer(layer.index)}
                    onKeyDown={(e) => handleLayerKeyDown(layer, position, e)}
                    draggable={canEditLayers && layers.length > 1}
                    onDragStart={(e) => handleLayerDragStart(position, e)}
                    onDragOver={(e) => handleLayerDragOver(position, e)}
                    onDrop={(e) => handleLayerDrop(position, e)}
                    onDragEnd={handleLayerDragEnd}
                    tabIndex={canEditLayers ? 0 : -1}
                    aria-grabbed={draggingPosition === position ? "true" : undefined}
                    data-react-controlled="true"
                    style={{
                        opacity: draggingPosition === position ? 0.35 : undefined,
                        outline: dropPosition === position ? "1px solid #228be6" : undefined,
                    }}
                >
                    <button
                        className={`eye${layer.visible ? " on" : ""}`}
                        data-react-controlled="true"
                        onClick={(e) => handleToggleVisible(layer.index, e)}
                        disabled={!canEditLayers}
                        title={layer.visible ? "hide layer" : "show layer"}
                        aria-pressed={layer.visible}
                    >
                        <i className={layer.visible ? "fas fa-eye" : "fas fa-eye-slash"}></i>
                    </button>
                    <button
                        className={`lock${layer.locked ? " on" : ""}`}
                        data-react-controlled="true"
                        onClick={(e) => handleToggleLocked(layer.index, e)}
                        disabled={!canEditLayers}
                        title={layer.locked ? "unlock layer" : "lock layer"}
                        aria-pressed={layer.locked}
                    >
                        <i className={layer.locked ? "fas fa-lock" : "fas fa-unlock"}></i>
                    </button>
                    <button
                        className={`share${layer.shared ? " on" : ""}`}
                        data-react-controlled="true"
                        onClick={(e) => handleToggleShared(layer.index, e)}
                        disabled={!canEditLayers}
                        title={layer.shared ? "unshare layer" : "share layer"}
                        aria-pressed={layer.shared}
                    >
                        <i className="fas fa-exchange-alt"></i>
                    </button>
                    {renamingId === layer.id ? (
                        <input
                            type="text"
                            value={renameInput}
                            autoFocus
                            onChange={(e) => setRenameInput(e.currentTarget.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") {
                                    renameCanceledRef.current = true;
                                    setRenamingId(null);
                                    focusLayerAfterRender(getLayerKey(layer));
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: "11px", width: "80px" }}
                        />
                    ) : (
                        <span
                            className="layerName"
                            onDoubleClick={(e) => startRename(layer.id, layer.name, e)}
                            title="double-click to rename"
                        >
                            {getLayerLabel(layer)} ({layer.type})
                        </span>
                    )}
                    <button
                        className="delete"
                        data-react-controlled="true"
                        onClick={(e) => handleDeleteLayer(layer.index, e)}
                        disabled={!canEditLayers}
                        title="delete layer"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </li>
            ))}
        </ul>
    );
}

export const LegacyCopyPasteControls = CopyPasteControls;
export const LegacySwapControls = SwapControls;
export const LegacyImageRefControls = ImageRefControls;
export const LegacyTextEditControls = TextEditControls;
export const LegacyPropertyControls = PropertyControls;
export const LegacyLayerControls = LayerControls;

