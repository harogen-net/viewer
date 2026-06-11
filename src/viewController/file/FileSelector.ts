import $ from "jquery";
import { showNotice } from "../../runtime/notice";
import { DocumentStorageUseCase } from "../../useCase/DocumentStorageUseCase";
import { handleStorageActionResult } from "../../useCase/storageActionResult";
import { Viewer, ViewerStartUpMode } from "../../Viewer";

type SelectValue = string | number | string[] | null;

export class FileSelector {
	constructor(private readonly documentStorage: DocumentStorageUseCase) {
		let selectObj = $("select.filename");

		const handleResult = (resultPromise: ReturnType<DocumentStorageUseCase["loadResult"]>) => {
			handleStorageActionResult(resultPromise, (message) => {
				showNotice(message);
			});
		};

		this.documentStorage.onUpdated(() => {
			let index = selectObj.prop("selectedIndex");
			let selectedValue =
				parseInt(($("select.filename option")[index] as HTMLOptionElement).value) || 0;
			let initOption = $("select.filename option")[0];
			selectObj.empty();
			selectObj.append($(initOption));

			let nextIndex = index;
			this.documentStorage.getTitles().forEach((datum, index2) => {
				if (datum.id == selectedValue) {
					nextIndex = index2 + 1;
				}
				selectObj.append(`<option value="${datum.id}">${datum.title}</option>`);
			});

			if (nextIndex < 0) nextIndex = 0;
			if (nextIndex > this.documentStorage.getTitles().length)
				nextIndex = this.documentStorage.getTitles().length;
			selectObj.prop("selectedIndex", nextIndex);

			let nextValue = ($("select.filename option")[nextIndex] as HTMLOptionElement).value;
			if (nextValue) {
				handleResult(this.documentStorage.loadResult(nextValue));
			}
		});

		const handleSelectChange = (val: SelectValue) => {
			if (val == -1 || val == null) return;
			handleResult(this.documentStorage.loadResult(val));
		};

		selectObj.change((e) => {
			handleSelectChange(selectObj.val());
		});

		const handleFileSelectClick = (direction: boolean) => {
			const val = selectObj.val();
			const targetOp = selectObj.find(`option[value="${val}"]`)[direction ? "next" : "prev"]();
			if (targetOp.length == 0) return;
			const nextVal = targetOp.attr("value");
			selectObj.val(nextVal);
			handleResult(this.documentStorage.loadResult(nextVal));
		};

		$(".fileSelect.up").click(() => handleFileSelectClick(false));
		$(".fileSelect.down").click(() => handleFileSelectClick(true));

		$(".load").click(() => {
			handleSelectChange(selectObj.val());
		});

		const handleDispose = () => {
			let val = selectObj.val();
			if (val == -1 || val == null) return;
			if (
				Viewer.startUpMode != ViewerStartUpMode.VIEW_ONLY ||
				window.confirm("delete selected save data. Are you sure?")
			) {
				handleResult(this.documentStorage.deleteResult(val));
			}
		};

		const disposeEvent =
			Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT ? "dblclick" : "click";
		$(".dispose").on(disposeEvent, handleDispose);
	}
}
