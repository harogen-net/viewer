import { Viewer } from "./Viewer";
declare const require: Function;
require("jquery-ui/ui/widgets/sortable.js");
require("jquery-ui/ui/widgets/resizable.js");
declare var $: any;


$(function(){
	console.log("init");
	let viewer:Viewer = new Viewer($("body"));
});
