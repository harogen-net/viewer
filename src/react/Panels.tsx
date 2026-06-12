import { useState } from "react";
import { setImagesContainerElement, setSaveFormat } from "../runtime/reactDomRegistry";

type SaveFormat = "png" | "hvz" | "hvd";

export function PrefPanel() {
	const [open, setOpen] = useState(false);
	const [saveFormat, setSaveFormatState] = useState<SaveFormat>("png");

	const handleSaveFormatChange = (format: SaveFormat) => {
		setSaveFormatState(format);
		setSaveFormat(format);
	};

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
						<label>
							<input type="checkbox" name="doc_sensitive" />
							<span>sensitive file</span>
						</label>
					</dd>
				</dl>
				<dl>
					<dt>SAVE FORMAT TYPE</dt>
					<dd>
						<label>
							<input
								type="radio"
								name="saveFormat"
								checked={saveFormat === "png"}
								onChange={() => handleSaveFormatChange("png")}
							/>
							<span>.png</span>
						</label>
						<label>
							<input
								type="radio"
								name="saveFormat"
								checked={saveFormat === "hvz"}
								onChange={() => handleSaveFormatChange("hvz")}
							/>
							<span>.hvz(zipped)</span>
						</label>
						<label>
							<input
								type="radio"
								name="saveFormat"
								checked={saveFormat === "hvd"}
								onChange={() => handleSaveFormatChange("hvd")}
							/>
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

