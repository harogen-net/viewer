import { ViewerBridge } from "../bridge/ViewerBridge";
import { attachEventDispatcher, type EventDispatcher } from "../events/EventDispatcher";
import type { Slide } from "../model/Slide";
import { slideStore } from "../state/slideStore";

export class ListViewController {
	declare listeners: EventDispatcher["listeners"];
	declare dispatchEvent: EventDispatcher["dispatchEvent"];
	declare addEventListener: EventDispatcher["addEventListener"];
	declare removeEventListener: EventDispatcher["removeEventListener"];
	declare clearEventListener: EventDispatcher["clearEventListener"];
	declare containEventListener: EventDispatcher["containEventListener"];
	declare hasEventListener: EventDispatcher["hasEventListener"];

	constructor(private readonly canEdit: boolean = true) {
		attachEventDispatcher(this);
		this.initialize();
	}

	initialize(): void {
		slideStore.getState().setSlides([], -1);
	}

	addSlide(slide: Slide, index: number = -1): Slide {
		if (!this.canEdit) return slide;

		slideStore.getState().addSlide(slide, index);

		ViewerBridge.emit("slidesChanged", {
			slides: this.slides,
			selectedIndex: this.selectedSlideIndex,
		});
		return slide;
	}

	public moveSelectedSlideByOffset(offset: number): boolean {
		if (!this.canEdit || !this.selectedSlide) return false;
		if (!Number.isInteger(offset) || offset === 0) return false;
		const fromIndex = this.selectedSlideIndex;
		if (fromIndex === -1) return false;
		const toIndex = Math.max(0, Math.min(this.slides.length - 1, fromIndex + offset));
		return this.moveSelectedSlideToIndex(toIndex);
	}

	public moveSelectedSlideToIndex(toIndex: number): boolean {
		if (!this.canEdit || !this.selectedSlide) return false;
		if (!Number.isInteger(toIndex)) return false;
		const fromIndex = this.selectedSlideIndex;
		if (fromIndex === -1) return false;
		const clampedToIndex = Math.max(0, Math.min(this.slides.length - 1, toIndex));
		if (clampedToIndex === fromIndex) return false;

		if (!slideStore.getState().moveSelectedSlideToIndex(clampedToIndex)) return false;
		this.dispatchEvent(new Event("select"));
		ViewerBridge.emit("selectionChanged", { selectedIndex: this.selectedSlideIndex });
		ViewerBridge.emit("slidesChanged", {
			slides: this.slides,
			selectedIndex: this.selectedSlideIndex,
		});
		return true;
	}

	public selectSlideByIndex(index: number): void {
		if (index < 0 || index >= this.slides.length) return;
		this.selectSlide(this.slides[index]);
	}

	public selectSlideInstance(slide: Slide): void {
		if (!slide || this.slides.indexOf(slide) === -1) return;
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
		var index: number = this.slides.indexOf(slide);
		if (index == -1) return;

		const wasSelected = slide === this.selectedSlide;
		var nextSlide: Slide = null;
		if (wasSelected) {
			if (index < this.slides.length - 1) {
				nextSlide = this.slides[index + 1];
			} else if (index > 0) {
				nextSlide = this.slides[index - 1];
			}
		}

		slideStore.getState().removeSlide(slide);
		if (destroySlide) {
			slide.removeAllLayers();
			slide.clearEventListener();
		}

		if (nextSlide) {
			this.selectSlide(nextSlide);
		} else if (wasSelected) {
			slideStore.getState().setSelectedIndex(-1);
			this.dispatchEvent(new Event("close"));
		}
		ViewerBridge.emit("slidesChanged", {
			slides: this.slides,
			selectedIndex: this.selectedSlideIndex,
		});

		return slide;
	}

	//

	private selectSlide(slide: Slide = null) {
		slideStore.getState().setSelectedSlide(slide);

		this.dispatchEvent(new Event("select"));
		ViewerBridge.emit("selectionChanged", { selectedIndex: this.selectedSlideIndex });
	}

	private selectSlideOffset(offset: number = 0) {
		if (offset == 0) return;
		var index = this.selectedSlideIndex;
		if (index == -1) return;
		var index2 = index + offset;
		if (index2 < 0) index2 = 0;
		if (index2 > this.slides.length - 1) index2 = this.slides.length - 1;
		if (index2 == index) return;
		this.selectSlide(this.slides[index2]);
	}

	//
	// getset
	//
	get selectedSlide(): Slide {
		return slideStore.getState().selectedSlide;
	}
	public set slides(value: Slide[]) {
		if (!value) return;
		slideStore.getState().setSlides(value, -1);
		ViewerBridge.emit("slidesChanged", {
			slides: this.slides,
			selectedIndex: this.selectedSlideIndex,
		});
	}
	public get slides(): Slide[] {
		return slideStore.getState().slides as Slide[];
	}

	get selectedSlideIndex(): number {
		return slideStore.getState().selectedIndex;
	}
}
