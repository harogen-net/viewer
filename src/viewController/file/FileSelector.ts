import $ from "jquery";
import { ViewerBridge } from "../../bridge/ViewerBridge";
import { Viewer, ViewerStartUpMode } from "../../Viewer";

type SelectValue = string | number | string[] | null;

export class FileSelector {
	constructor() {
		let selectObj = $("select.filename");

		const selectSavedFile = (val: SelectValue) => {
			const selectedId = val == null || val == -1 ? null : String(val);
			Viewer.shared.commandSelectSavedFile(selectedId);
		};

		const rebuildOptions = (titles: readonly { id: number; title: string }[]) => {
			const selectedValue = selectObj.val();
			const initOption = $("select.filename option")[0];
			selectObj.empty();
			selectObj.append($(initOption));

			titles.forEach((datum) => {
				selectObj.append(`<option value="${datum.id}">${datum.title}</option>`);
			});

			const selectedStillExists =
				selectedValue != null &&
				selectedValue != -1 &&
				titles.some((t) => String(t.id) === String(selectedValue));
			if (selectedStillExists) {
				selectObj.val(String(selectedValue));
				return;
			}
			if (titles.length > 0) {
				selectObj.val(String(titles[0].id));
			} else {
				selectObj.val("-1");
			}
		};

		ViewerBridge.subscribe("savedFilesChanged", ({ titles }) => {
			rebuildOptions(titles);
			selectSavedFile(selectObj.val());
		});

		const handleSelectChange = (val: SelectValue) => {
			selectSavedFile(val);
			if (val == -1 || val == null) return;
			Viewer.shared.commandLoadSelectedSavedFile();
		};

		selectObj.change((e) => {
			handleSelectChange(selectObj.val());
		});

		ViewerBridge.subscribe("savedFileSelectionChanged", ({ selectedId }) => {
			selectObj.val(selectedId ?? "-1");
		});

		const handleFileSelectClick = (direction: boolean) => {
			if (direction) {
				Viewer.shared.commandSelectNextSavedFile();
			} else {
				Viewer.shared.commandSelectPreviousSavedFile();
			}
			Viewer.shared.commandLoadSelectedSavedFile();
		};

		$(".fileSelect.up").click(() => handleFileSelectClick(false));
		$(".fileSelect.down").click(() => handleFileSelectClick(true));

		$(".load").click(() => {
			handleSelectChange(selectObj.val());
		});

		const handleDispose = () => {
			selectSavedFile(selectObj.val());
			if (
				Viewer.startUpMode != ViewerStartUpMode.VIEW_ONLY ||
				window.confirm("delete selected save data. Are you sure?")
			) {
				Viewer.shared.commandDeleteSelectedSavedFile();
			}
		};

		const disposeEvent =
			Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT ? "dblclick" : "click";
		$(".dispose").on(disposeEvent, handleDispose);
		selectSavedFile(selectObj.val());
	}
}
