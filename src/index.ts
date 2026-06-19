import '@fortawesome/fontawesome-free/css/all.css';
import $ from "jquery";
import 'jquery-ui-dist/jquery-ui';
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { Viewer, ViewerStartUpMode } from "./Viewer";
import { AppShell } from "./components/AppShell";

import '../css/slideShow.scss';
import '../css/ui.scss';

$(function () {
	console.log("init");

	var startUpMode = ViewerStartUpMode.VIEW_AND_EDIT;
	try {
		if (isIOS()) startUpMode = ViewerStartUpMode.VIEW_ONLY;
	} catch (e) { }
	new Viewer($("body"), startUpMode);
	createRoot(document.getElementById("root")!).render(createElement(AppShell));
});

function isIOS() {
	return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window["MSStream"];
}