import $ from "jquery";
import { showNotice } from "../../runtime/notice";
import { StorageEventType } from "../../storage/StorageAdapter";
import { DocumentStorageUseCase, StorageAction } from "../../useCase/DocumentStorageUseCase";
import { Viewer, ViewerStartUpMode } from "../../Viewer";

type SelectValue = string | number | string[] | null;

export class FileSelector {
	constructor(private readonly documentStorage: DocumentStorageUseCase) {
		let selectObj = $("select.filename");

		this.documentStorage.addEventListener(StorageEventType.UPDATE, (e: CustomEvent) => {
			let index = selectObj.prop("selectedIndex");
			let selectedValue = parseInt(($("select.filename option")[index] as HTMLOptionElement).value) || 0;
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
			if (nextIndex > this.documentStorage.getTitles().length) nextIndex = this.documentStorage.getTitles().length;
			selectObj.prop("selectedIndex", nextIndex);
			
			let nextValue = ($("select.filename option")[nextIndex] as HTMLOptionElement).value;
			if (nextValue && !this.documentStorage.load(nextValue)) {
				this.notifyStorageFailure(StorageAction.LOAD);
			}
		});

		const handleSelectChange = (val: SelectValue) => {
			if (val == -1 || val == null) return;
			if (!this.documentStorage.load(val)) {
				this.notifyStorageFailure(StorageAction.LOAD);
			}
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
			if (!this.documentStorage.load(nextVal)) {
				this.notifyStorageFailure(StorageAction.LOAD);
			}
		};

		$(".fileSelect.up").click(() => handleFileSelectClick(false));
		$(".fileSelect.down").click(() => handleFileSelectClick(true));

		$(".load").click(() => {
			handleSelectChange(selectObj.val());
		});

		const handleDispose = () => {
			let val = selectObj.val();
			if (val == -1 || val == null) return;
			if (Viewer.startUpMode != ViewerStartUpMode.VIEW_ONLY || (window.confirm('delete selected save data. Are you sure?'))) {
				if (!this.documentStorage.delete(val)) {
					this.notifyStorageFailure(StorageAction.DELETE);
				}
			}
		};

		const disposeEvent = Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT ? "dblclick" : "click";
		$(".dispose").on(disposeEvent, handleDispose);
	}

	private notifyStorageFailure(action: StorageAction): void {
		showNotice(this.documentStorage.getLastErrorMessage(action));
	}
}