import $ from "jquery";
import { ViewerBridge } from "../bridge/ViewerBridge";
import { EventDispatcher } from "../events/EventDispatcher";
import { IDroppable } from "../interface/IDroppable";
import { ImageLayer } from "../model/layer/ImageLayer";
import { Slide } from "../model/Slide";
import { ViewerDocument } from "../model/ViewerDocument";
import { DropHelper } from "../utils/DropHelper";
import { ThumbSlideView } from "../view/slide/ThumbSlideView";
import { SlideView } from "../view/SlideView";
import { Viewer, ViewerMode, ViewerStartUpMode } from "../Viewer";

export class ListViewController extends EventDispatcher implements IDroppable {
	private readonly THUMB_HEIGHT: number = 110;

	private containerObj: any;

	private _slides: Slide[];
	private _slideViews: ThumbSlideView[];
	private _slideViewsById: any;
	private _selectedSlide: Slide;

	private _mode: ViewerMode;

	private contextTargetSlide: Slide | null = null; //こいつが原因でバグを発生しそうな予感

	constructor(
		public obj: any,
		private readonly canEdit: boolean = true
	) {
		super();
		document.documentElement.style.setProperty("--slideThumbHeight", this.THUMB_HEIGHT + "px");

		this.obj.addClass("slideList");

		this.containerObj = $('<div class="container" />').appendTo(this.obj);
		this.containerObj.sortable({
			items: ".slide",
			revert: 200,
			scroll: false,
			distance: 10,
			cursor: "move",
			tolerance: "pointer",
			//helper:"clone",
			forcePlaceholderSize: true,
			forceHelperSize: true,
			disabled: !this.canEdit,
			update: () => {
				this.onSlideSort();
			},
		});

		this._slides = [];
		this._slideViews = [];
		this._slideViewsById = {};

		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			var dropHelper = new DropHelper(this);
			dropHelper.addEventListener(DropHelper.EVENT_DROP_COMPLETE, (e: CustomEvent) => {
				var layer = new ImageLayer(e.detail);
				if (layer.originHeight > layer.originWidth * 1.2) {
					layer.rotation -= 90;
				}
				var slide = new Slide(null, null, [layer]);
				slide.fitLayer(layer);
				this.addSlide(slide);
			});
		}

		$(window).resize(() => {
			setTimeout(() => {
				this._slideViews.forEach((slide) => {
					// $.each(this._slideViews, (index:number, slide:ThumbSlideView) =>{
					var bool: boolean = slide.selected;
					slide.selected = false;
					slide.fitToHeight();
					slide.selected = bool;
				});
			}, 50);
		});

		if (Viewer.startUpMode == ViewerStartUpMode.VIEW_AND_EDIT) {
			this.obj.on("contextmenu.slide", (e) => {
				if (this._slides.length > 0) {
					this.contextTargetSlide = null;
					this.onContextMenu(
						new CustomEvent("contextmenu", { detail: { x: e.clientX, y: e.clientY } })
					);
					return false;
				}
			});
		}
	}

	setMode(mode: ViewerMode): void {
		this._mode = mode;
		switch (mode) {
			case ViewerMode.SELECT:
				this._slideViews.forEach((slideView) => {
					slideView.fitToHeight();
				});
				break;
			case ViewerMode.EDIT:
				this._slideViews.forEach((slideView) => {
					slideView.fitToHeight();
				});
				setTimeout(() => {
					this.scrollToSelected();
				}, 300);
				break;
		}
	}

	initialize(): void {
		this._slideViews.forEach((slideView) => {
			slideView.clearEventListener();
			slideView.destroy();
		});
		this._slideViews = [];
	}

	addSlide(slide: Slide, index: number = -1): Slide {
		if (!this.canEdit) return slide;
		console.log("addSlide called : " + this._slides.length);

		if (index != -1 && index < this._slides.length) {
			this._slides.splice(index, 0, slide);
		} else {
			this._slides.push(slide);
		}

		this.setSlideUp(slide, index);
		this.sortSlideViewByIndex();

		ViewerBridge.emit("slidesChanged", { slides: this._slides, selectedIndex: this.selectedSlideIndex });
		return slide;
	}

	public addNewSlideAndSelect(): void {
		if (!this.canEdit) return;
		if (this._slideViews.length > 0) {
			this._slideViews[this._slideViews.length - 1].slide.joining = false;
		}
		const slide = new Slide(ViewerDocument.shared.width, ViewerDocument.shared.height);
		this.addSlide(slide);
		this.selectSlide(slide);
	}

	public cloneSelectedSlide(): void {
		if (!this.canEdit || !this._selectedSlide) return;
		this.clonseSlide(this._selectedSlide);
	}

	public deleteSelectedSlide(): void {
		if (!this.canEdit || !this._selectedSlide) return;
		this.removeSlide(this._selectedSlide, true);
	}

	public moveSelectedSlideByOffset(offset: number): boolean {
		if (!this.canEdit || !this._selectedSlide) return false;
		if (!Number.isInteger(offset) || offset === 0) return false;
		const fromIndex = this._slides.indexOf(this._selectedSlide);
		if (fromIndex === -1) return false;
		const toIndex = Math.max(0, Math.min(this._slides.length - 1, fromIndex + offset));
		return this.moveSelectedSlideToIndex(toIndex);
	}

	public moveSelectedSlideToIndex(toIndex: number): boolean {
		if (!this.canEdit || !this._selectedSlide) return false;
		if (!Number.isInteger(toIndex)) return false;
		const fromIndex = this._slides.indexOf(this._selectedSlide);
		if (fromIndex === -1) return false;
		const clampedToIndex = Math.max(0, Math.min(this._slides.length - 1, toIndex));
		if (clampedToIndex === fromIndex) return false;

		const [slide] = this._slides.splice(fromIndex, 1);
		this._slides.splice(clampedToIndex, 0, slide);
		const [slideView] = this._slideViews.splice(fromIndex, 1);
		this._slideViews.splice(clampedToIndex, 0, slideView);

		this.sortSlideViewByIndex();
		this.selectSlide(slide);
		ViewerBridge.emit("slidesChanged", { slides: this._slides, selectedIndex: this.selectedSlideIndex });
		return true;
	}

	public selectSlideByIndex(index: number): void {
		if (index < 0 || index >= this._slides.length) return;
		this.selectSlide(this._slides[index]);
	}

	public selectSlideInstance(slide: Slide): void {
		if (!slide || this._slides.indexOf(slide) === -1) return;
		this.selectSlide(slide);
	}

	public consumeContextTargetSlide(): Slide | null {
		const slide = this.contextTargetSlide;
		this.contextTargetSlide = null;
		return slide;
	}

	public requestSlideContextMenuByIndex(index: number, top: number, left: number): void {
		if (!this.canEdit) return;
		if (index < 0 || index >= this._slides.length) return;
		this.contextTargetSlide = this._slides[index];
		const offset = this.obj.offset() ?? { top: 0, left: 0 };
		ViewerBridge.emit("listContextMenuRequested", {
			kind: "slide",
			top: top - offset.top,
			left: left - offset.left,
		});
	}

	public selectPreviousSlide(): void {
		this.selectSlideOffset(-1);
	}

	public selectNextSlide(): void {
		this.selectSlideOffset(1);
	}

	private getSlideViewBySlide(slide: Slide): ThumbSlideView {
		return this._slideViewsById[slide.id] || null;
	}

	private setSlideUp(slide: Slide, index: number = -1) {
		var scale: number = this.THUMB_HEIGHT / slide.height;
		var slideView: ThumbSlideView = new ThumbSlideView(slide, $("<div />"), scale);
		if (index != -1 && index < this._slides.length) {
			this._slideViews.splice(index, 0, slideView);
		} else {
			this._slideViews.push(slideView);
		}
		this._slideViewsById[slide.id] = slideView;

		//sortable用にslideのidをslideViewのobjにセット
		slideView.obj.data("id", slide.id);

		slideView.obj.appendTo(this.containerObj);
		slideView.fitToHeight();
		this.sortSlideViewByIndex();

		slideView.addEventListener("select", this.onSlideSelect);
		slideView.addEventListener("edit", this.onSlideEdit);
		slideView.addEventListener("contextmenu", this.onContextMenu);

		slideView.show();
	}

	clonseSlide(slide: Slide): Slide {
		if (!this.canEdit) return slide;
		if (this._slides.indexOf(slide) == -1) return;

		var clonedSlide: Slide = slide.clone();
		this.addSlide(clonedSlide, this._slides.indexOf(slide) + 1);
		this.selectSlide(clonedSlide);
		slide.joining = true;

		return clonedSlide;
	}

	private onSlideSelect = (ce: CustomEvent) => {
		this.selectSlide(ce.detail as Slide);
	};
	private onSlideEdit = (ce: CustomEvent) => {
		this.dispatchEvent(new Event("edit"));
	};
	private onContextMenu = (ce: CustomEvent) => {
		if (!this.canEdit) return;
		var offset = this.obj.offset() ?? { top: 0, left: 0 };
		this.contextTargetSlide = ce.detail.slide || null;
		ViewerBridge.emit("listContextMenuRequested", {
			kind: ce.detail.slide != undefined ? "slide" : "list",
			top: ce.detail.y - offset.top,
			left: ce.detail.x - offset.left,
		});
	};

	removeSlide(slide: Slide, isAnimation: boolean = false, destroySlide: boolean = true): Slide {
		if (!this.canEdit) return slide;
		var index: number = this._slides.indexOf(slide);
		if (index == -1) return;

		var slideView: ThumbSlideView = this.getSlideViewBySlide(slide);
		slideView.removeEventListener("select", this.onSlideSelect);
		slideView.removeEventListener("edit", this.onSlideEdit);
		slideView.removeEventListener("contextmenu", this.onContextMenu);
		//slideView.clearEventListener();	//dispatchEventを発端とするスタック中で実行するとエラーになる

		var nextSlide: Slide = null;
		if (slideView.selected) {
			if (index < this._slideViews.length - 1) {
				nextSlide = this._slideViews[index + 1].slide;
			} else if (index > 0) {
				nextSlide = this._slideViews[index - 1].slide;
			}
		}
		var removeMain = () => {
			this._slideViews.splice(index, 1);
			delete this._slideViewsById[slide.id];
			slideView.destroy();
			slideView = null;

			this._slides.splice(index, 1);
			if (destroySlide) {
				slide.removeAllLayers();
				slide.clearEventListener();
			}
			slide = null;
		};

		if (isAnimation) {
			this.obj.css("pointer-events", "none");
			slideView.obj.fadeOut(200, () => {
				this.obj.css("pointer-events", "");
				if (nextSlide) {
					this.selectSlide(nextSlide);
				} else {
					this.dispatchEvent(new Event("close"));
				}
				removeMain();
				this.sortSlideViewByIndex();
				ViewerBridge.emit("slidesChanged", { slides: this._slides, selectedIndex: this.selectedSlideIndex });
			});
		} else {
			removeMain();
			this.sortSlideViewByIndex();
			if (nextSlide) {
				this.selectSlide(nextSlide);
			} else {
				this.dispatchEvent(new Event("close"));
			}
			ViewerBridge.emit("slidesChanged", { slides: this._slides, selectedIndex: this.selectedSlideIndex });
		}

		return slide;
	}

	//

	private selectSlide(slide: Slide = null) {
		this._selectedSlide = slide;

		this._slideViews.forEach((slideView) => {
			slideView.selected = slide == slideView.slide;
		});

		this.dispatchEvent(new Event("select"));
		this.scrollToSelected();
		ViewerBridge.emit("selectionChanged", { selectedIndex: this.selectedSlideIndex });
	}

	private selectSlideOffset(offset: number = 0) {
		if (offset == 0) return;
		var index = this._slides.indexOf(this._selectedSlide);
		if (index == -1) return;
		var index2 = index + offset;
		if (index2 < 0) index2 = 0;
		if (index2 > this._slides.length - 1) index2 = this._slides.length - 1;
		if (index2 == index) return;
		this.selectSlide(this._slides[index2]);
	}

	private scrollToSelected() {
		if (!this._selectedSlide) return;
		switch (this._mode) {
			case ViewerMode.SELECT:
				//	this.obj.animate({"scrollTop":this._selectedSlide.obj.position().top});
				break;
			case ViewerMode.EDIT:
				this.containerObj.animate({
					scrollLeft:
						this.selectedSlideView.obj.position().left +
						this.containerObj.scrollLeft() -
						this.containerObj.width() / 2 +
						this.selectedSlideView.obj.width() / 2 -
						40,
				});
				//「40」はbody.edit .slideList .containerの左右padding値
				break;
		}
	}

	private sortSlideViewByIndex() {
		if (this._slideViews.length == 0) return;

		this._slideViews.forEach((slide) => {
			// $.each(this._slideViews, (i:number, slide:ThumbSlideView) => {
			this.containerObj.append(slide.obj);
			slide.obj.removeClass("last");
		});
		this._slideViews[this._slideViews.length - 1].obj.addClass("last");
		this.containerObj.sortable("refresh");
	}

	//

	private onSlideSort() {
		if (!this.canEdit) return;
		this.containerObj.find(".slide").each((i: number, elem: any) => {
			this._slideViews[i] = this._slideViewsById[$(elem).data("id")];
		});
		this._slides.sort((a: Slide, b: Slide) => {
			return this._slideViews.indexOf(this.getSlideViewBySlide(a)) <
				this._slideViews.indexOf(this.getSlideViewBySlide(b))
				? -1
				: 1;
		});
		this.sortSlideViewByIndex();
		ViewerBridge.emit("slidesChanged", { slides: this._slides, selectedIndex: this.selectedSlideIndex });
	}

	//
	// getset
	//
	get selectedSlide(): Slide {
		return this._selectedSlide;
	}
	get selectedSlideView(): SlideView {
		return this.getSlideViewBySlide(this._selectedSlide);
	}

	get isActive(): boolean {
		return true;
	}

	public set slides(value: Slide[]) {
		if (!value) return;
		this.initialize();

		this._slides = value;

		//valueの参照を消さずに、valueの中のslideがaddSlideされた後のようにする
		//割とめんどくさい処理
		for (var i = 0; i < this._slides.length; i++) {
			this.setSlideUp(this._slides[i]);
		}
		this.sortSlideViewByIndex();
		ViewerBridge.emit("slidesChanged", { slides: this._slides, selectedIndex: this.selectedSlideIndex });
	}
	public get slides(): Slide[] {
		return this._slides;
	}

	get selectedSlideIndex(): number {
		if (this._selectedSlide == null) {
			return -1;
		} else {
			return this._slides.indexOf(this._selectedSlide);
		}
	}
}
