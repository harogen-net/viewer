export function CopyPasteControls() {
    return (
        <>
            <button className="copyTrans" title="変形をコピー">
                <i className="fas fa-clipboard"></i>
            </button>
            <button className="pasteTrans" title="変形をペースト">
                <i className="far fa-clipboard"></i>
            </button>
        </>
    );
}

export function SwapControls() {
    return (
        <>
            <button className="bottom">
                <i className="fas fa-arrow-circle-down"></i>
            </button>
            <button className="down">
                <i className="fas fa-arrow-down"></i>
            </button>
            <button className="up">
                <i className="fas fa-arrow-up"></i>
            </button>
            <button className="top">
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
                    <button className="mirrorH" data-desc="flip selected image horizontally">
                        <i className="fas fa-arrows-alt-h"></i>
                    </button>
                    <button className="mirrorV" data-desc="flip selected image vertically">
                        <i className="fas fa-arrows-alt-v"></i>
                    </button>
                </dd>
            </dl>
            <dl className="rotation">
                <dt>
                    rotation
                    <button className="resetRotation">
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
                    <button className="resetOpacity">
                        <i className="fas fa-times"></i>
                    </button>
                </dt>
                <dd>
                    <input type="text" defaultValue="1" />
                </dd>
                <dd>
                    <button className="isText" data-desc="this image contains text">
                        <i className="far fa-image"></i>
                        <i className="fas fa-font"></i>
                    </button>
                </dd>
            </dl>
            <dl className="clip">
                <dt>
                    clip
                    <button className="resetClip">
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

