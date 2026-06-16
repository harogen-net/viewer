import type { Layer } from "../model/Layer";
import type { ImageLayer } from "../model/layer/ImageLayer";
import type { TextLayer } from "../model/layer/TextLayer";
import type { Direction } from "../model/Slide";
import { Command, HistoryManager } from "../utils/HistoryManager";

export type LayerMutationRenderScope = "selection" | "current";

export type LayerMutationOptions<TLayer extends Layer, TValue> = {
	render?: LayerMutationRenderScope;
	includeLayerList?: boolean;
	validate?: (nextValue: TValue, currentValue: TValue, layer: TLayer) => boolean;
	equals?: (currentValue: TValue, nextValue: TValue) => boolean;
};

export type LayerMutationSlide = {
	layers: Layer[];
	indexOf: (layer: Layer) => number;
	addLayer: (layer: Layer, index?: number) => Layer;
	fitLayer: (layer: Layer) => Layer;
	arrangeLayer: (layer: Layer, direction: Direction) => Layer;
	swapLayer: (layer: Layer, offset: number) => Layer;
};

export type EditLayerMutationUseCase = {
	recordLayerMutation: (
		apply: () => void,
		revert: () => void,
		render?: LayerMutationRenderScope,
		includeLayerList?: boolean
	) => boolean;
	mutateSelectedLayer: <TLayer extends Layer>(
		mutate: (layer: TLayer) => boolean,
		guard?: (layer: Layer) => layer is TLayer
	) => boolean;
	setSelectedLayerValue: <TLayer extends Layer, TValue>(
		read: (layer: TLayer) => TValue,
		write: (layer: TLayer, value: TValue) => void,
		nextValue: TValue,
		options?: LayerMutationOptions<TLayer, TValue>,
		guard?: (layer: Layer) => layer is TLayer
	) => boolean;
	toggleSelectedLayerValue: <TLayer extends Layer>(
		read: (layer: TLayer) => boolean,
		write: (layer: TLayer, value: boolean) => void,
		options?: LayerMutationOptions<TLayer, boolean>,
		guard?: (layer: Layer) => layer is TLayer
	) => boolean;
	setSelectedImageLayerValue: <TValue>(
		read: (layer: ImageLayer) => TValue,
		write: (layer: ImageLayer, value: TValue) => void,
		nextValue: TValue,
		options?: LayerMutationOptions<ImageLayer, TValue>
	) => boolean;
	toggleSelectedLayerIsText: () => boolean;
	toggleSelectedLayerVisible: () => boolean;
	toggleSelectedLayerLocked: () => boolean;
	toggleSelectedLayerShared: () => boolean;
	setSelectedLayerName: (name: string) => boolean;
	setSelectedLayerText: (text: string) => boolean;
	rotateSelectedLayer: (degree: number) => boolean;
	toggleSelectedLayerMirrorH: () => boolean;
	toggleSelectedLayerMirrorV: () => boolean;
	fitSelectedLayer: () => boolean;
	arrangeSelectedLayer: (direction: Direction) => boolean;
	swapSelectedLayer: (offset: number) => boolean;
	moveSelectedLayerToTop: () => boolean;
	moveSelectedLayerToBottom: () => boolean;
	moveSelectedLayerToIndex: (toIndex: number) => boolean;
	nudgeSelectedLayer: (deltaX: number, deltaY: number) => boolean;
	setSelectedLayerPosition: (nextX: number, nextY: number) => boolean;
	scaleSelectedLayer: (factor: number) => boolean;
	setSelectedLayerScale: (scale: number) => boolean;
	adjustSelectedLayerRotation: (delta: number) => boolean;
	setSelectedLayerRotation: (rotation: number) => boolean;
	resetSelectedLayerRotation: () => boolean;
	adjustSelectedLayerOpacity: (delta: number) => boolean;
	setSelectedLayerOpacity: (opacity: number) => boolean;
	resetSelectedLayerOpacity: () => boolean;
	setSelectedImageClip: (top: number, right: number, bottom: number, left: number) => boolean;
	resetSelectedImageClip: () => boolean;
};

export type EditLayerMutationUseCaseOptions = {
	getSelectedLayer: () => Layer | null;
	getCurrentSlide?: () => LayerMutationSlide | null;
	maxLayerMoveOffset?: number;
	emitAfterMutation: (render: LayerMutationRenderScope, includeLayerList: boolean) => void;
};

export function isImageLayer(layer: Layer): layer is ImageLayer {
	return layer.type === "image";
}

export function isTextLayer(layer: Layer): layer is TextLayer {
	return layer.type === "text";
}

export function createEditLayerMutationUseCase(
	options: EditLayerMutationUseCaseOptions
): EditLayerMutationUseCase {
	function recordLayerMutation(
		apply: () => void,
		revert: () => void,
		render: LayerMutationRenderScope = "selection",
		includeLayerList = false
	): boolean {
		HistoryManager.shared.record(new Command(apply, revert)).do();
		options.emitAfterMutation(render, includeLayerList);
		return true;
	}

	function mutateSelectedLayer<TLayer extends Layer>(
		mutate: (layer: TLayer) => boolean,
		guard: (layer: Layer) => layer is TLayer = (layer: Layer): layer is TLayer => true
	): boolean {
		const layer = options.getSelectedLayer();
		if (!layer || !guard(layer)) return false;
		return mutate(layer);
	}

	function setSelectedLayerValue<TLayer extends Layer, TValue>(
		read: (layer: TLayer) => TValue,
		write: (layer: TLayer, value: TValue) => void,
		nextValue: TValue,
		mutationOptions: LayerMutationOptions<TLayer, TValue> = {},
		guard?: (layer: Layer) => layer is TLayer
	): boolean {
		return mutateSelectedLayer<TLayer>((layer) => {
			const currentValue = read(layer);
			const equals = mutationOptions.equals ?? Object.is;
			if (mutationOptions.validate && !mutationOptions.validate(nextValue, currentValue, layer)) {
				return false;
			}
			if (equals(currentValue, nextValue)) return true;
			return recordLayerMutation(
				() => write(layer, nextValue),
				() => write(layer, currentValue),
				mutationOptions.render,
				mutationOptions.includeLayerList
			);
		}, guard);
	}

	function toggleSelectedLayerValue<TLayer extends Layer>(
		read: (layer: TLayer) => boolean,
		write: (layer: TLayer, value: boolean) => void,
		mutationOptions: LayerMutationOptions<TLayer, boolean> = {},
		guard?: (layer: Layer) => layer is TLayer
	): boolean {
		const layer = options.getSelectedLayer();
		if (!layer || (guard && !guard(layer))) return false;
		return setSelectedLayerValue(read, write, !read(layer as TLayer), mutationOptions, guard);
	}

	function setSelectedImageLayerValue<TValue>(
		read: (layer: ImageLayer) => TValue,
		write: (layer: ImageLayer, value: TValue) => void,
		nextValue: TValue,
		mutationOptions: LayerMutationOptions<ImageLayer, TValue> = {}
	): boolean {
		return setSelectedLayerValue(read, write, nextValue, mutationOptions, isImageLayer);
	}

	function getSelectedSlideLayer(): { slide: LayerMutationSlide; layer: Layer } | null {
		const slide = options.getCurrentSlide?.() ?? null;
		const layer = options.getSelectedLayer();
		if (!slide || !layer) return null;
		return { slide, layer };
	}

	function toggleSelectedLayerIsText(): boolean {
		return toggleSelectedLayerValue<ImageLayer>(
			(layer) => layer.isText,
			(layer, value) => {
				layer.isText = value;
			},
			{ render: "current" },
			isImageLayer
		);
	}

	function toggleSelectedLayerVisible(): boolean {
		return toggleSelectedLayerValue(
			(layer) => layer.visible,
			(layer, value) => {
				layer.visible = value;
			},
			{ includeLayerList: true }
		);
	}

	function toggleSelectedLayerLocked(): boolean {
		return toggleSelectedLayerValue(
			(layer) => layer.locked,
			(layer, value) => {
				layer.locked = value;
			},
			{ includeLayerList: true }
		);
	}

	function toggleSelectedLayerShared(): boolean {
		return toggleSelectedLayerValue(
			(layer) => layer.shared,
			(layer, value) => {
				layer.shared = value;
			},
			{ includeLayerList: true }
		);
	}

	function setSelectedLayerName(name: string): boolean {
		const nextName = (name ?? "").trim();
		if (!nextName) return false;
		return setSelectedLayerValue(
			(layer) => layer.name,
			(layer, value) => {
				layer.name = value;
			},
			nextName,
			{ includeLayerList: true }
		);
	}

	function setSelectedLayerText(text: string): boolean {
		const nextText = text ?? "";
		return setSelectedLayerValue<TextLayer, string>(
			(layer) => layer.text,
			(layer, value) => {
				layer.text = value;
			},
			nextText,
			{ render: "current" },
			isTextLayer
		);
	}

	function rotateSelectedLayer(degree: number): boolean {
		return mutateSelectedLayer((layer) => {
			if (!isFinite(degree)) return false;
			return setSelectedLayerValue(
				(targetLayer) => targetLayer.rotation,
				(targetLayer, value) => {
					targetLayer.rotation = value;
				},
				layer.rotation + degree,
				{ render: "current" }
			);
		});
	}

	function toggleSelectedLayerMirrorH(): boolean {
		return toggleSelectedLayerValue(
			(layer) => layer.mirrorH,
			(layer, value) => {
				layer.mirrorH = value;
			}
		);
	}

	function toggleSelectedLayerMirrorV(): boolean {
		return toggleSelectedLayerValue(
			(layer) => layer.mirrorV,
			(layer, value) => {
				layer.mirrorV = value;
			}
		);
	}

	function fitSelectedLayer(): boolean {
		const context = getSelectedSlideLayer();
		if (!context) return false;
		const currentTransform = context.layer.transform;
		return recordLayerMutation(
			() => {
				context.slide.fitLayer(context.layer);
			},
			() => {
				context.layer.transform = currentTransform;
			}
		);
	}

	function arrangeSelectedLayer(direction: Direction): boolean {
		const context = getSelectedSlideLayer();
		if (!context) return false;
		const currentX = context.layer.x;
		const currentY = context.layer.y;
		return recordLayerMutation(
			() => {
				context.slide.arrangeLayer(context.layer, direction);
			},
			() => {
				context.layer.x = currentX;
				context.layer.y = currentY;
			}
		);
	}

	function swapSelectedLayer(offset: number): boolean {
		const context = getSelectedSlideLayer();
		if (!context) return false;
		return recordLayerMutation(
			() => {
				context.slide.swapLayer(context.layer, offset);
			},
			() => {
				context.slide.swapLayer(context.layer, -offset);
			},
			"current"
		);
	}

	function moveSelectedLayerToTop(): boolean {
		return moveSelectedLayerByOffset(options.maxLayerMoveOffset ?? 20);
	}

	function moveSelectedLayerToBottom(): boolean {
		return moveSelectedLayerByOffset(-(options.maxLayerMoveOffset ?? 20));
	}

	function moveSelectedLayerByOffset(offset: number): boolean {
		const context = getSelectedSlideLayer();
		if (!context) return false;
		const currentIndex = context.slide.indexOf(context.layer);
		return recordLayerMutation(
			() => {
				context.slide.swapLayer(context.layer, offset);
			},
			() => {
				context.slide.addLayer(context.layer, currentIndex);
			},
			"current"
		);
	}

	function moveSelectedLayerToIndex(toIndex: number): boolean {
		const context = getSelectedSlideLayer();
		if (!context) return false;
		const fromIndex = context.slide.indexOf(context.layer);
		if (
			fromIndex === -1 ||
			toIndex < 0 ||
			toIndex >= context.slide.layers.length ||
			fromIndex === toIndex
		) {
			return false;
		}
		return recordLayerMutation(
			() => {
				context.slide.addLayer(context.layer, toIndex);
			},
			() => {
				context.slide.addLayer(context.layer, fromIndex);
			},
			"current"
		);
	}

	function nudgeSelectedLayer(deltaX: number, deltaY: number): boolean {
		const layer = options.getSelectedLayer();
		if (!layer) return false;
		return setSelectedLayerPosition(layer.x + deltaX, layer.y + deltaY);
	}

	function setSelectedLayerPosition(nextX: number, nextY: number): boolean {
		return mutateSelectedLayer((layer) => {
			if (!isFinite(nextX) || !isFinite(nextY)) return false;
			const currentX = layer.x;
			const currentY = layer.y;
			if (currentX === nextX && currentY === nextY) return true;
			return recordLayerMutation(
				() => {
					layer.x = nextX;
					layer.y = nextY;
				},
				() => {
					layer.x = currentX;
					layer.y = currentY;
				}
			);
		});
	}

	function scaleSelectedLayer(factor: number): boolean {
		if (!isFinite(factor) || factor <= 0) return false;
		const layer = options.getSelectedLayer();
		if (!layer) return false;
		return setSelectedLayerScale(layer.scale * factor);
	}

	function setSelectedLayerScale(scale: number): boolean {
		return setSelectedLayerValue(
			(layer) => layer.scale,
			(layer, value) => {
				layer.scale = value;
			},
			scale,
			{
				validate: (value) => isFinite(value) && value > 0,
			}
		);
	}

	function adjustSelectedLayerRotation(delta: number): boolean {
		const layer = options.getSelectedLayer();
		if (!layer) return false;
		return setSelectedLayerRotation(layer.rotation + delta);
	}

	function setSelectedLayerRotation(rotation: number): boolean {
		return setSelectedLayerValue(
			(layer) => layer.rotation,
			(layer, value) => {
				layer.rotation = value;
			},
			rotation,
			{
				validate: (value) => isFinite(value),
			}
		);
	}

	function resetSelectedLayerRotation(): boolean {
		return setSelectedLayerRotation(0);
	}

	function adjustSelectedLayerOpacity(delta: number): boolean {
		const layer = options.getSelectedLayer();
		if (!layer) return false;
		return setSelectedLayerOpacity(layer.opacity + delta);
	}

	function setSelectedLayerOpacity(opacity: number): boolean {
		if (!isFinite(opacity)) return false;
		const clampedOpacity = Math.max(0, Math.min(1, opacity));
		return setSelectedLayerValue(
			(layer) => layer.opacity,
			(layer, value) => {
				layer.opacity = value;
			},
			clampedOpacity
		);
	}

	function resetSelectedLayerOpacity(): boolean {
		return setSelectedLayerOpacity(1);
	}

	function setSelectedImageClip(top: number, right: number, bottom: number, left: number): boolean {
		const values = [top, right, bottom, left];
		if (values.some((value) => !isFinite(value))) return false;
		const nextClipRect = values.map((value) => Math.max(0, value));
		return setSelectedImageLayerValue(
			(layer) => layer.clipRect.concat(),
			(layer, value) => {
				layer.clipRect = value;
			},
			nextClipRect,
			{
				equals: (currentValue, nextValue) =>
					currentValue.every((value, index) => value === nextValue[index]),
			}
		);
	}

	function resetSelectedImageClip(): boolean {
		return setSelectedImageClip(0, 0, 0, 0);
	}

	return {
		recordLayerMutation,
		mutateSelectedLayer,
		setSelectedLayerValue,
		toggleSelectedLayerValue,
		setSelectedImageLayerValue,
		toggleSelectedLayerIsText,
		toggleSelectedLayerVisible,
		toggleSelectedLayerLocked,
		toggleSelectedLayerShared,
		setSelectedLayerName,
		setSelectedLayerText,
		rotateSelectedLayer,
		toggleSelectedLayerMirrorH,
		toggleSelectedLayerMirrorV,
		fitSelectedLayer,
		arrangeSelectedLayer,
		swapSelectedLayer,
		moveSelectedLayerToTop,
		moveSelectedLayerToBottom,
		moveSelectedLayerToIndex,
		nudgeSelectedLayer,
		setSelectedLayerPosition,
		scaleSelectedLayer,
		setSelectedLayerScale,
		adjustSelectedLayerRotation,
		setSelectedLayerRotation,
		resetSelectedLayerRotation,
		adjustSelectedLayerOpacity,
		setSelectedLayerOpacity,
		resetSelectedLayerOpacity,
		setSelectedImageClip,
		resetSelectedImageClip,
	};
}
