import { useState } from "react";
import { setImagesContainerElement } from "../runtime/reactDomRegistry";

export function PrefPanel() {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button onClick={() => setOpen((v) => !v)}>
				<i className="fas fa-ellipsis-h"></i>
			</button>
			<div className="menu" style={{ display: open ? "block" : "none" }}>
				<dl>
					<dt>size</dt>
					<dd>
						W<input type="text" /> x H<input type="text" />
					</dd>
				</dl>
				<dl>
					<dt>contents</dt>
					<dd>
						<label htmlFor="doc_sensitive">
							<input type="checkbox" id="doc_sensitive" name="doc_sensitive" />
							<span>sensitive file</span>
						</label>
					</dd>
				</dl>
				<dl>
					<dt>SAVE FORMAT TYPE</dt>
					<dd>
						<label htmlFor="saveFormat_png">
							<input type="radio" id="saveFormat_png" name="saveFormat" defaultChecked />
							<span>.png</span>
						</label>
						<label htmlFor="saveFormat_hvz">
							<input type="radio" id="saveFormat_hvz" name="saveFormat" />
							<span>.hvz(zipped)</span>
						</label>
						<label htmlFor="saveFormat_hvd">
							<input type="radio" id="saveFormat_hvd" name="saveFormat" />
							<span>.hvd(text)</span>
						</label>
					</dd>
				</dl>
			</div>
		</>
	);
}

export function ImagesPanel() {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button onClick={() => setOpen((v) => !v)}>
				<i className="fas fa-images"></i>
			</button>
			<div
				id="images-panel-container"
				className="container"
				ref={(element) => setImagesContainerElement(element)}
				style={{ display: open ? "block" : "none" }}></div>
		</>
	);
}

export const LegacyPrefPanel = PrefPanel;
export const LegacyImagesPanel = ImagesPanel;

