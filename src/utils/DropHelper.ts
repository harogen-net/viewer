import naturalCompare from "natural-compare";
import { EventDispatcher } from "../events/EventDispatcher";
import { IDroppable } from "../interface/IDroppable";
import { ImageManager } from "./ImageManager";

export class DropHelper extends EventDispatcher {
	public static readonly EVENT_DROP_COMPLETE: string = "DropHelper.EVENT_DROP_COMPLETE";
	public static readonly EVENT_DROP_SLIDEDATA: string = "DropHelper.EVENT_DROP_SLIDEDATA";

	constructor(target: IDroppable) {
		super();

		const getElement = () => target.element;

		getElement()?.addEventListener("dragover", (e: DragEvent) => {
			if (!target.isActive) return;

			e.preventDefault();
			e.stopPropagation();
			getElement()?.classList.add("fileOver");
		});
		getElement()?.addEventListener("dragleave", () => {
			if (!target.isActive) return;

			getElement()?.classList.remove("fileOver");
		});
		getElement()?.addEventListener("drop", async (e: DragEvent) => {
			if (!target.isActive) return;

			e.preventDefault();
			e.stopPropagation();
			getElement()?.classList.remove("fileOver");

			var droppedImageId: string = e.dataTransfer?.getData("imageId") ?? "";
			if (droppedImageId && droppedImageId.length > 0) {
				var ce: CustomEvent = new CustomEvent(DropHelper.EVENT_DROP_COMPLETE, {
					detail: droppedImageId,
				});
				this.dispatchEvent(ce);
				return;
			}

			// var files:File[] = [];
			// //e.originalEvent.dataTransfer.files.forEach(file=>{
			var files: File[] = Array.from(e.dataTransfer?.files ?? []) as File[];

			if (files.length > 1) {
				var dic: any = {};
				var names: string[] = [];
				for (var i: number = 0; i < files.length; i++) {
					dic[files[i].name] = files[i];
					names.push(files[i].name);
				}

				var initIndex: number = names.indexOf(names.concat().sort(naturalCompare)[0]);

				for (var i: number = 0; i < files.length; i++) {
					files[i] = dic[names[(i + initIndex) % names.length]];
				}
			}

			//foreachだと同時に投げられてしまい、不具合が生じる
			//よって素直にForで回し、順番を保証する
			for (var i = 0; i < files.length; i++) {
				var file = files[i];
				try {
					var imageId: string = await ImageManager.shared.registImageFromFile(file);
					var ce: CustomEvent = new CustomEvent(DropHelper.EVENT_DROP_COMPLETE, {
						detail: imageId,
					});
					this.dispatchEvent(ce);
				} catch (e) {
					console.log(e);
				}
			}
			// files.forEach(async file=>{
			// });
		});
	}
}
