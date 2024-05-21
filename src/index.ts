import '@fortawesome/fontawesome-free/css/all.css';
import $ from "jquery";
import 'jquery-ui-dist/jquery-ui';
import { Viewer, ViewerStartUpMode } from "./Viewer";
declare var viewOnly: any;

$(function () {
	console.log("init");
	var startUpMode = ViewerStartUpMode.VIEW_AND_EDIT;
	try {
		if (viewOnly) startUpMode = ViewerStartUpMode.VIEW_ONLY;
	} catch (e) { }
	new Viewer($("body"), startUpMode);
});