import '@fortawesome/fontawesome-free/css/all.css';
import $ from "jquery";
import 'jquery-ui-dist/jquery-ui';
import { Viewer, ViewerStartUpMode } from "./Viewer";
import './css/ui.scss';
import './css/slideShow.scss';
import "./css/tailwind.css";

$(function () {
	console.log("init");

	var startUpMode = ViewerStartUpMode.VIEW_AND_EDIT;
	try {
		if (isIOS()) startUpMode = ViewerStartUpMode.VIEW_ONLY;
	} catch (e) { }
	new Viewer($("body"), startUpMode);
});

function isIOS() {
	return false;
	// return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window["MSStream"];
}