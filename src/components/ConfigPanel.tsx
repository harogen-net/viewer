import React, { useEffect, useState } from "react";
import { RViewerDocument } from "../model/ViewerDocument";
import { GlobalAny } from "../utils/GlobalAny";
import { DataType } from "../model/DataType";
import {
	Button,
	Checkbox,
	Drawer,
	Form,
	Input,
	InputGroup,
	Placeholder,
	Radio,
	RadioGroup,
	Stack,
} from "rsuite";
import "rsuite/dist/rsuite.min.css";
import { useDocument } from "../hooks/useDocument";

export const ConfigPanel: React.FC<{}> = ({}) => {
	const [isOpen, setIsOpen] = useState(false);
	const [formatType, setFormatType] = useState<DataType>(DataType.PNG);

	const { document } = useDocument();

	useEffect(() => {
		GlobalAny.configPanel_formatType = formatType;
		console.log(GlobalAny);
	}, [formatType]);

	return (
		<>
			<Button
				onClick={() => {
					setIsOpen((prev) => !prev);
				}}>
				<i className="fas fa-ellipsis-h"></i>
			</Button>
			<Drawer open={isOpen} onClose={() => setIsOpen(false)} size={"400px"}>
				<Drawer.Body>
					<dl>
						<dt>size</dt>
						<dd>
							<Stack direction="row" spacing={10}>
								<Input value={document?.width} disabled={document == undefined}></Input>
								<Input plaintext value="x" />
								<Input value={document?.height} disabled={document == undefined}></Input>
							</Stack>
						</dd>
					</dl>
					<dl>
						<dt>contents</dt>
						<dd>
							<label htmlFor="doc_sensitive">
								<Checkbox checked={false} disabled={document == undefined}>
									sensitive file
								</Checkbox>
								{/* <input type="checkbox" id="doc_sensitive" name="doc_sensitive" />
                  <span>sensitive file</span> */}
							</label>
						</dd>
					</dl>
					<dl>
						<dt>SAVE FORMAT TYPE</dt>
						<dd>
							<RadioGroup
								value={formatType}
								onChange={(value) => {
									setFormatType(value as DataType);
								}}>
								<Radio value={DataType.PNG}>.png</Radio>
								<Radio value={DataType.HVZ}>.hvz(zipped)</Radio>
								<Radio value={DataType.HVD}>.hvd(text)</Radio>
							</RadioGroup>
						</dd>
					</dl>
				</Drawer.Body>
			</Drawer>
		</>
	);
};
