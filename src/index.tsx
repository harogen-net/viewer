import React from "react";
import ReactDOM from "react-dom/client";
// import "./css/index.css";
import { Viewer } from "./components/Viewer";
import '@fortawesome/fontawesome-free/css/all.css';
import $ from "jquery";
import 'jquery-ui-dist/jquery-ui';
// import { Viewer, ViewerStartUpMode } from "./Viewer";
import './css/ui.scss';
import './css/slideShow.scss';
import "./css/tailwind.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<Viewer></Viewer>
	</React.StrictMode>
);
