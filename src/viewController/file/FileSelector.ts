import $ from "jquery";
import { FeatureGate } from "../../runtime/featureGate";
import { SlideStorage } from "../../utils/SlideStorage";
import { Viewer, ViewerStartUpMode } from "../../Viewer";

export class FileSelector {
	constructor(private readonly gate?:FeatureGate) {
		let storage = SlideStorage.getInstance();
		let selectObj = $("select.filename");

		storage.addEventListener("update", (e: CustomEvent) => {
			let index = selectObj.prop("selectedIndex");
			let selectedValue = parseInt(($("select.filename option")[index] as HTMLOptionElement).value) || 0;
			let initOption = $("select.filename option")[0];
			selectObj.empty();
			selectObj.append($(initOption));

			let nextIndex = index;
			storage.titles.forEach((datum, index2) => {
				if (datum.id == selectedValue) {
					nextIndex = index2 + 1;
				}
				selectObj.append(`<option value="${datum.id}">${datum.title}</option>`);
			});

			if (nextIndex < 0) nextIndex = 0;
			if (nextIndex > storage.titles.length) nextIndex = storage.titles.length;
			selectObj.prop("selectedIndex", nextIndex);
			
			let nextValue = ($("select.filename option")[nextIndex] as HTMLOptionElement).value;
			if (nextValue) storage.load(nextValue);
		});

		const handleSelectChange = (val: any) => {
			if (val == -1 || val == null) return;
			storage.load(val);
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
			storage.load(nextVal);
		};

		$(".fileSelect.up").click(() => handleFileSelectClick(false));
		$(".fileSelect.down").click(() => handleFileSelectClick(true));

		$(".load").click(() => {
			handleSelectChange(selectObj.val());
		});

		const handleDispose = () => {
			if(!this.canDeleteSavedData()) return;
			let val = selectObj.val();
			if (val == -1 || val == null) return;
			if (Viewer.startUpMode != ViewerStartUpMode.VIEW_ONLY || (window.confirm('delete selected save data. Are you sure?'))) {
				storage.delete(val);
			}
		};

		const disposeEvent = Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT ? "dblclick" : "click";
		$(".dispose").on(disposeEvent, handleDispose);
	}

	private canDeleteSavedData(): boolean {
		if(this.gate) return this.gate.canDeleteSavedData;
		return true;
	}
}