export function Menu() {
	return (
		<>
			<div>
				<button className="startSlideShow">
					<i className="fas fa-play"></i>
				</button>
			</div>
			<div className="pulldown">
				<button className="pulldownOpener" data-target="fileIo">files...</button>
				<ul id="fileIo">
					<li>
						<button className="new">
							<i className="far fa-file"></i> <span>new document</span>
						</button>
					</li>
					<li>
						<button className="import">
							<i className="fas fa-file-export"></i> <span>import</span>
						</button>
					</li>
					<li>
						<button className="export">
							<i className="fas fa-file-import"></i> <span>export</span>
						</button>
					</li>
					<li>
						<button className="zip">
							<i className="fas fa-file-archive"></i> <span>export images</span>
						</button>
					</li>
				</ul>
				<input className="import" type="file" defaultValue="" accept=".png,.hvd,.hvz" />
			</div>
			<div>
				<button className="fileSelect up">
					<i className="fas fa-chevron-left"></i>
				</button>
				<select className="filename">
					<option value="-1">---quick save---</option>
				</select>
				<button className="fileSelect down">
					<i className="fas fa-chevron-right"></i>
				</button>
			</div>
			<div>
				<button className="save">
					<i className="fas fa-save"></i>
				</button>
				<button className="load">
					<i className="fas fa-download"></i>
				</button>
				<button className="dispose">
					<i className="fas fa-trash"></i>
				</button>
			</div>
			<div></div>
			<div>
				<span>
					DURATION:
					<select id="duration">
						<option value="1">0</option>
						<option value="500">500</option>
						<option value="1000">1000</option>
						<option value="2000" defaultValue="2000">2000</option>
						<option value="3000">3000</option>
						<option value="4000">4000</option>
						<option value="5000">5000</option>
					</select>
				</span>
				<span>
					INTERVAL:
					<select id="interval">
						<option value="500">500</option>
						<option value="1000">1000</option>
						<option value="2000">2000</option>
						<option value="3000">3000</option>
						<option value="4000">4000</option>
						<option value="5000">5000</option>
						<option value="6000" defaultValue="6000">6000</option>
						<option value="7000">7000</option>
						<option value="8000">8000</option>
						<option value="9000">9000</option>
						<option value="10000">10000</option>
						<option value="11000">11000</option>
						<option value="12000">12000</option>
						<option value="13000">13000</option>
						<option value="14000">14000</option>
						<option value="15000">15000</option>
					</select>
				</span>
				<span>
					<input id="bgColor" type="color" list="bgColorList" defaultValue="#999999" />
				</span>
				<datalist id="bgColorList">
					<option value="#000000"></option>
					<option value="#333333"></option>
					<option value="#666666"></option>
					<option value="#999999"></option>
					<option value="#FFFFFF"></option>
				</datalist>
			</div>
			<div>
				<label htmlFor="cb_fullscreen">
					<input id="cb_fullscreen" className="fullscreen" type="checkbox" />
					<span>FULLSCREEN</span>
				</label>
			</div>
			<div>
				<label htmlFor="cb_mirrorH">
					<input id="cb_mirrorH" className="fullscreen" type="checkbox" />
					<span>MIRROR H</span>
				</label>
				<label htmlFor="cb_mirrorV">
					<input id="cb_mirrorV" className="fullscreen" type="checkbox" />
					<span>MIRROR V</span>
				</label>
			</div>
		</>
	);
}

export const LegacyMenu = Menu;

