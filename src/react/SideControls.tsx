import { useEffect, useRef, useState } from "react";
import { ViewerCommands } from "../bridge/ViewerCommands";
import { useViewerEditLayerState, useViewerMode } from "../bridge/useViewerBridge";

export function CopyPasteControls() {
	const { hasSelection } = useViewerEditLayerState();
	const { mode } = useViewerMode();
	const canEditLayer = mode === "edit" && hasSelection;

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

export function SwapControls() {
	const { hasSelection } = useViewerEditLayerState();
	const { mode } = useViewerMode();
	const canEditLayer = mode === "edit" && hasSelection;

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

export function ImageRefControls() {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [replaceForAll, setReplaceForAll] = useState(false);
	const { hasSelection, layerType } = useViewerEditLayerState();
	const { mode } = useViewerMode();
	const canEditLayer = mode === "edit" && hasSelection;
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

export function TextEditControls() {
    const { hasSelection, layerType, textContent } = useViewerEditLayerState();
    const { mode } = useViewerMode();
    const canEditLayer = mode === "edit" && hasSelection;
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

export function PropertyControls() {
    const { hasSelection, layerType, x, y, scale, rotation, opacity, clipTop, clipRight, clipBottom, clipLeft } = useViewerEditLayerState();
    const { mode } = useViewerMode();
    const canEditLayer = mode === "edit" && hasSelection;
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

    const applyScale = () => {
        if (!canEditLayer) return;
        const nextScale = Number(scaleInput);
        if (!isFinite(nextScale) || nextScale <= 0) return;
        ViewerCommands.setSelectedLayerScale(nextScale);
    };

    const applyRotation = () => {
        if (!canEditLayer) return;
        const nextRotation = Number(rotationInput);
        if (!isFinite(nextRotation)) return;
        ViewerCommands.setSelectedLayerRotation(nextRotation);
    };

    const applyOpacity = () => {
        if (!canEditLayer) return;
        const nextOpacity = Number(opacityInput);
        if (!isFinite(nextOpacity)) return;
        ViewerCommands.setSelectedLayerOpacity(nextOpacity);
    };

    const applyClip = () => {
        if (!canEditLayer || !isImageLayer) return;
        const nextTop = Number(clipTopInput);
        const nextRight = Number(clipRightInput);
        const nextBottom = Number(clipBottomInput);
        const nextLeft = Number(clipLeftInput);
        if (!isFinite(nextTop) || !isFinite(nextRight) || !isFinite(nextBottom) || !isFinite(nextLeft)) return;
        const currentTop = clipTop ?? 0;
        const currentRight = clipRight ?? 0;
        const currentBottom = clipBottom ?? 0;
        const currentLeft = clipLeft ?? 0;
        if (nextTop !== currentTop) {
            ViewerCommands.adjustSelectedImageClip("top", nextTop - currentTop);
        }
        if (nextRight !== currentRight) {
            ViewerCommands.adjustSelectedImageClip("right", nextRight - currentRight);
        }
        if (nextBottom !== currentBottom) {
            ViewerCommands.adjustSelectedImageClip("bottom", nextBottom - currentBottom);
        }
        if (nextLeft !== currentLeft) {
            ViewerCommands.adjustSelectedImageClip("left", nextLeft - currentLeft);
        }
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
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        disabled={!canEditLayer}
                    />
                </dd>
                <dd>
                    <input
                        type="text"
                        value={positionYInput}
                        onChange={(e) => setPositionYInput(e.currentTarget.value)}
                        onBlur={applyPosition}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
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
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        disabled={!canEditLayer}
                    />
                </dd>
                <dd>
                    <button
                        className="mirrorH"
                        data-react-controlled="true"
                        data-desc="flip selected image horizontally"
                        disabled={!canEditLayer}
                        onClick={() => ViewerCommands.toggleSelectedLayerMirrorH()}>
                        <i className="fas fa-arrows-alt-h"></i>
                    </button>
                    <button
                        className="mirrorV"
                        data-react-controlled="true"
                        data-desc="flip selected image vertically"
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
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
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
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        disabled={!canEditLayer}
                    />
                </dd>
                <dd>
                    <button
                        className="isText"
                        data-react-controlled="true"
                        data-desc="this image contains text"
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
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        disabled={!canEditLayer || !isImageLayer}
                    />
                </dd>
                <dd>
                    <input
                        type="text"
                        value={clipRightInput}
                        onChange={(e) => setClipRightInput(e.currentTarget.value)}
                        onBlur={applyClip}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        disabled={!canEditLayer || !isImageLayer}
                    />
                </dd>
                <dd>
                    <input
                        type="text"
                        value={clipBottomInput}
                        onChange={(e) => setClipBottomInput(e.currentTarget.value)}
                        onBlur={applyClip}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        disabled={!canEditLayer || !isImageLayer}
                    />
                </dd>
                <dd>
                    <input
                        type="text"
                        value={clipLeftInput}
                        onChange={(e) => setClipLeftInput(e.currentTarget.value)}
                        onBlur={applyClip}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        disabled={!canEditLayer || !isImageLayer}
                    />
                </dd>
            </dl>
        </>
    );
}

export function LayerControls() {
    return <ul></ul>;
}

export const LegacyCopyPasteControls = CopyPasteControls;
export const LegacySwapControls = SwapControls;
export const LegacyImageRefControls = ImageRefControls;
export const LegacyTextEditControls = TextEditControls;
export const LegacyPropertyControls = PropertyControls;
export const LegacyLayerControls = LayerControls;

