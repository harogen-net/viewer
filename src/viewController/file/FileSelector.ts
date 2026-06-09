import $ from "jquery";
import { FeatureGate } from "../../runtime/featureGate";
import { StorageAdapter } from "../../storage/StorageAdapter";
import { Viewer, ViewerStartUpMode } from "../../Viewer";

export class FileSelector {
	constructor(private readonly storage:StorageAdapter, private readonly gate?:FeatureGate) {
		let selectObj = $("select.filename");

		this.storage.addEventListener("update", (e: CustomEvent) => {
			let index = selectObj.prop("selectedIndex");
			let selectedValue = parseInt(($("select.filename option")[index] as HTMLOptionElement).value) || 0;
			let initOption = $("select.filename option")[0];
			selectObj.empty();
			selectObj.append($(initOption));

			let nextIndex = index;
			this.storage.getTitles().forEach((datum, index2) => {
				if (datum.id == selectedValue) {
					nextIndex = index2 + 1;
				}
				selectObj.append(`<option value="${datum.id}">${datum.title}</option>`);
			});

			if (nextIndex < 0) nextIndex = 0;
			if (nextIndex > this.storage.getTitles().length) nextIndex = this.storage.getTitles().length;
			selectObj.prop("selectedIndex", nextIndex);
			
			let nextValue = ($("select.filename option")[nextIndex] as HTMLOptionElement).value;
			if (nextValue) this.storage.load(nextValue);
		});

		const handleSelectChange = (val: any) => {
			if (val == -1 || val == null) return;
			this.storage.load(val);
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
			this.storage.load(nextVal);
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
				this.storage.delete(val);
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