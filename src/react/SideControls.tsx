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
    return (
        <>
            <button className="imageRef">
                <span>
                    <i className="fas fa-file-image"></i> IMG REF.
                </span>{" "}
                <label htmlFor="cb_imageRef">
                    <input id="cb_imageRef" type="checkbox" />
                    <span>forALL</span>
                </label>
            </button>
            <input className="imageRef" type="file" defaultValue="" accept="image/*" />
            <button className="download">
                <i className="fas fa-file-download"></i>
            </button>
        </>
    );
}

export function TextEditControls() {
    return <textarea spellCheck={false}></textarea>;
}

export function PropertyControls() {
    const { hasSelection, layerType } = useViewerEditLayerState();
    const { mode } = useViewerMode();
    const canEditLayer = mode === "edit" && hasSelection;
    const isImageLayer = layerType === "image";

    return (
        <>
            <dl className="position">
                <dt>position</dt>
                <dd>
                    <input type="text" defaultValue="0" />
                </dd>
                <dd>
                    <input type="text" defaultValue="0" />
                </dd>
            </dl>
            <dl className="scale">
                <dt>scale</dt>
                <dd>
                    <input type="text" defaultValue="1" />
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
                    <input type="text" defaultValue="0" />
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
                    <input type="text" defaultValue="1" />
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
                    <input type="text" defaultValue="0" />
                </dd>
                <dd>
                    <input type="text" defaultValue="0" />
                </dd>
                <dd>
                    <input type="text" defaultValue="0" />
                </dd>
                <dd>
                    <input type="text" defaultValue="0" />
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

