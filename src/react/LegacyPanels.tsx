export function LegacyPrefPanel() {
	return (
		<>
			<button>
				<i className="fas fa-ellipsis-h"></i>
			</button>
			<div className="menu">
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

export function LegacyImagesPanel() {
	return (
		<>
			<button>
				<i className="fas fa-images"></i>
			</button>
			<div className="container"></div>
		</>
	);
}
