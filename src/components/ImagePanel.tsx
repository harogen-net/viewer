import React, { useEffect, useState } from "react";
import { ViewerDocument } from "../model/ViewerDocument";
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
import $ from "jquery";
import { ImageManager } from "../utils/ImageManager";

export const ImagePanel: React.FC<{ vdoc?: ViewerDocument }> = ({ vdoc }) => {
	const [isOpen, setIsOpen] = useState(false);

	useEffect(() => {
		ImageManager.init($("#images > .container"));
	}, []);

	return (
		<>
			<Button
				onClick={() => {
					setIsOpen((prev) => !prev);
				}}>
				<i className="fas fa-images"></i>
			</Button>
			<Drawer open={isOpen} onClose={() => setIsOpen(false)} placement="bottom">
				<Drawer.Body></Drawer.Body>
			</Drawer>
		</>
	);
};
