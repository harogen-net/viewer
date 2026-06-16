import { ViewerBridge } from "../bridge/ViewerBridge";
import { EventDispatcher } from "../events/EventDispatcher";
import type { Slide } from "../model/Slide";

export class ListViewController extends EventDispatcher {
	private _slides: Slide[];
	private _selectedSlide: Slide;

	constructor(private readonly canEdit: boolean = true) {
		super();

		this._slides = [];
	}

	initialize(): void {
		this._slides = [];
		this._selectedSlide = null;
	}

	addSlide(slide: Slide, index: number = -1): Slide {
		if (!this.canEdit) return slide;

		if (index != -1 && index < this._slides.length) {
			this._slides.splice(index, 0, slide);
		} else {
			this._slides.push(slide);
		}

		ViewerBridge.emit("slidesChanged", { slides: this._slides, selectedIndex: this.selectedSlideIndex });
		return slide;
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

	public selectPreviousSlide(): void {
		this.selectSlideOffset(-1);
	}

	public selectNextSlide(): void {
		this.selectSlideOffset(1);
	}

	removeSlide(slide: Slide, _isAnimation: boolean = false, destroySlide: boolean = true): Slide {
		if (!this.canEdit) return slide;
		var index: number = this._slides.indexOf(slide);
		if (index == -1) return;

		const wasSelected = slide === this._selectedSlide;
		var nextSlide: Slide = null;
		if (wasSelected) {
			if (index < this._slides.length - 1) {
				nextSlide = this._slides[index + 1];
			} else if (index > 0) {
				nextSlide = this._slides[index - 1];
			}
		}

		this._slides.splice(index, 1);
		if (destroySlide) {
			slide.removeAllLayers();
			slide.clearEventListener();
		}

		if (nextSlide) {
			this.selectSlide(nextSlide);
		} else if (wasSelected) {
			this._selectedSlide = null;
			this.dispatchEvent(new Event("close"));
		}
		ViewerBridge.emit("slidesChanged", { slides: this._slides, selectedIndex: this.selectedSlideIndex });

		return slide;
	}

	//

	private selectSlide(slide: Slide = null) {
		this._selectedSlide = slide;

		this.dispatchEvent(new Event("select"));
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

	//
	// getset
	//
	get selectedSlide(): Slide {
		return this._selectedSlide;
	}
	public set slides(value: Slide[]) {
		if (!value) return;
		this.initialize();

		this._slides = value;
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
