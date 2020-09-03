import { Viewer, ViewerStartUpMode } from "./Viewer";
declare const require: Function;
require("jquery-ui/ui/widgets/sortable.js");
require("jquery-ui/ui/widgets/resizable.js");
import $ from "jquery";
declare var viewOnly:any;

$(function(){
	console.log("init");
	var startUpMode = ViewerStartUpMode.VIEW_AND_EDIT;
	try {
		if (viewOnly) startUpMode = ViewerStartUpMode.VIEW_ONLY;
	}catch(Exception){ }
	let viewer:Viewer = new Viewer($("body"), startUpMode);
});