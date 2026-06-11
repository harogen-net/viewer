export function Menu() {
	return (
		<>
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

