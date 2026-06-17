import type { Layer } from "../model/Layer";
import type { ImageLayer } from "../model/layer/ImageLayer";
import type { TextLayer } from "../model/layer/TextLayer";
import type { Direction } from "../model/Slide";
import { Command, HistoryManager, type ICommand, Transaction } from "../utils/HistoryManager";

export type LayerMutationRenderScope = "selection" | "current";

export type LayerMutationOptions<TLayer extends Layer, TValue> = {
	render?: LayerMutationRenderScope;
	includeLayerList?: boolean;
	validate?: (nextValue: TValue, currentValue: TValue, layer: TLayer) => boolean;
	equals?: (currentValue: TValue, nextValue: TValue) => boolean;
};

export type LayerMutationSlide = {
	layers: readonly Layer[];
	centerX: number;
	centerY: number;
	indexOf: (layer: Layer) => number;
	addLayer: (layer: Layer, index?: number) => Layer;
	removeLayer: (layer: Layer) => Layer;
	fitLayer: (layer: Layer) => Layer;
	arrangeLayer: (layer: Layer, direction: Direction) => Layer;
	swapLayer: (layer: Layer, offset: number) => Layer;
};

export type TextLayerFactory = (text: string) => Layer;
export type ImageLayerFactory = (imageId: string) => Layer;
export type ImageRegistration = (file: File) => Promise<string | null>;
export type SlideLookup = (slide: LayerMutationSlide) => LayerMutationSlide | null;
export type SharedLayerRemovalTargetLookup = (layer: Layer) => readonly Layer[] | undefined;

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
	spreadSelectedLayer: () => boolean;
	fitSelectedLayer: () => boolean;
	arrangeSelectedLayer: (direction: Direction) => boolean;
	swapSelectedLayer: (offset: number) => boolean;
	moveSelectedLayerToTop: () => boolean;
	moveSelectedLayerToBottom: () => boolean;
	moveSelectedLayerToIndex: (toIndex: number) => boolean;
	canPasteLayer: () => boolean;
	canPasteLayerTransform: () => boolean;
	copySelectedLayer: () => boolean;
	cutSelectedLayer: () => boolean;
	pasteLayer: () => boolean;
	copySelectedLayerTransform: () => boolean;
	pasteLayerTransform: () => boolean;
	hasSelectedLayerSharedRemovalTargets: () => boolean;
	removeSelectedLayer: (confirmedSharedRemoval?: boolean) => boolean;
	addTextLayer: (text: string) => boolean;
	addImageLayer: (imageId: string) => boolean;
	replaceSelectedImage: (file: File, applyAllReferences: boolean) => Promise<boolean>;
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
	getNextSlide?: SlideLookup;
	getPrevSlide?: SlideLookup;
	getReferenceLayers?: () => readonly Layer[];
	getSharedLayerRemovalTargets?: SharedLayerRemovalTargetLookup;
	createTextLayer?: TextLayerFactory;
	createImageLayer?: ImageLayerFactory;
	registerImageFromFile?: ImageRegistration;
	selectLayer?: (layer: Layer) => void;
	trackSharedLayer?: (layer: Layer) => void;
	clearSharedLayerTracking?: (layer: Layer) => void;
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
	let copiedLayer: Layer | null = null;
	let copiedTransform: unknown = null;

	function recordLayerMutation(
		apply: () => void,
		revert: () => void,
		render: LayerMutationRenderScope = "selection",
		includeLayerList = false
	): boolean {
		recordCommittedCommand(new Command(apply, revert), render, includeLayerList);
		return true;
	}

	/**
	 * Record a command/transaction with the snapshot republish (`emitAfterMutation`)
	 * folded into its `fwd`/`rev`. This keeps model mutation and snapshot update in
	 * the same history transaction, so undo/redo republish atomically and there is
	 * no separate post-commit emit to drift out of sync.
	 */
	function recordCommittedCommand(
		command: ICommand,
		render: LayerMutationRenderScope,
		includeLayerList: boolean
	): void {
		const commit = () => options.emitAfterMutation(render, includeLayerList);
		const committed = new Command(
			() => {
				command.fwd();
				commit();
			},
			() => {
				command.rev();
				commit();
			}
		);
		HistoryManager.shared.record(committed).do();
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

	function isMatchingSpreadLayer(sourceLayer: Layer, targetLayer: Layer): boolean {
		if (targetLayer.type !== sourceLayer.type) return false;
		if (isImageLayer(sourceLayer) && isImageLayer(targetLayer)) {
			return sourceLayer.imageId === targetLayer.imageId;
		}
		if (isTextLayer(sourceLayer) && isTextLayer(targetLayer)) {
			return sourceLayer.text === targetLayer.text;
		}
		return false;
	}

	function spreadSelectedLayer(): boolean {
		const context = getSelectedSlideLayer();
		const getNextSlide = options.getNextSlide;
		const getPrevSlide = options.getPrevSlide;
		if (!context || !getNextSlide || !getPrevSlide) return false;
		if (context.slide.indexOf(context.layer) === -1) return false;
		if (!context.layer.shared) context.layer.shared = true;
		const index = context.slide.indexOf(context.layer);
		const transaction = new Transaction();

		const applyToSlide = (slide: LayerMutationSlide): boolean => {
			let continueToNext = true;
			let found = false;
			for (const targetLayer of slide.layers) {
				if (!isMatchingSpreadLayer(context.layer, targetLayer)) continue;
				found = true;
				if (targetLayer.shared) {
					continueToNext = false;
				} else {
					transaction.record(
						() => {
							targetLayer.shared = true;
						},
						() => {
							targetLayer.shared = false;
						}
					);
				}
				break;
			}
			if (!found) {
				const newLayer = context.layer.clone();
				transaction.record(
					() => {
						slide.addLayer(newLayer, index);
					},
					() => {
						slide.removeLayer(newLayer);
					}
				);
			}
			return continueToNext;
		};

		let slide = getNextSlide(context.slide);
		while (slide && applyToSlide(slide)) slide = getNextSlide(slide);
		slide = getPrevSlide(context.slide);
		while (slide && applyToSlide(slide)) slide = getPrevSlide(slide);

		if (transaction.length === 0) return true;
		options.trackSharedLayer?.(context.layer);
		recordCommittedCommand(transaction, "current", true);
		return true;
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

	function canPasteLayer(): boolean {
		return copiedLayer !== null;
	}

	function canPasteLayerTransform(): boolean {
		return copiedTransform !== null;
	}

	function copySelectedLayer(): boolean {
		const layer = options.getSelectedLayer();
		if (!layer) return false;
		copiedLayer = layer.clone();
		return true;
	}

	function cutSelectedLayer(): boolean {
		const context = getSelectedSlideLayer();
		if (!context) return false;
		copiedLayer = context.layer.clone();
		return removeSelectedLayer();
	}

	function pasteLayer(): boolean {
		const slide = options.getCurrentSlide?.() ?? null;
		if (!slide || !copiedLayer) return false;
		const pastedLayer = copiedLayer.clone();
		return recordLayerMutation(
			() => {
				slide.addLayer(pastedLayer);
				options.selectLayer?.(pastedLayer);
			},
			() => {
				slide.removeLayer(pastedLayer);
			},
			"current"
		);
	}

	function copySelectedLayerTransform(): boolean {
		const layer = options.getSelectedLayer();
		if (!layer) return false;
		copiedTransform = layer.transform;
		return true;
	}

	function pasteLayerTransform(): boolean {
		const layer = options.getSelectedLayer();
		if (!layer || !copiedTransform) return false;
		const currentTransform = layer.transform;
		const nextTransform = Object.assign({}, copiedTransform);
		return recordLayerMutation(
			() => {
				layer.transform = nextTransform;
			},
			() => {
				layer.transform = currentTransform;
			},
			"current"
		);
	}

	function hasSelectedLayerSharedRemovalTargets(): boolean {
		const layer = options.getSelectedLayer();
		if (!layer?.shared) return false;
		return options.getSharedLayerRemovalTargets?.(layer) !== undefined;
	}

	function removeSelectedLayer(confirmedSharedRemoval = false): boolean {
		const context = getSelectedSlideLayer();
		if (!context) return false;
		const currentIndex = context.slide.indexOf(context.layer);
		if (currentIndex === -1) return false;

		const sharedRemovalTargets =
			confirmedSharedRemoval && context.layer.shared
				? (options.getSharedLayerRemovalTargets?.(context.layer) ?? [])
				: [];
		const sharedRemovalEntries = sharedRemovalTargets
			.map((layer) => {
				const slide = layer.parent as LayerMutationSlide | null;
				const index = slide?.indexOf(layer) ?? -1;
				return slide && index !== -1 ? { layer, slide, index } : null;
			})
			.filter((entry): entry is { layer: Layer; slide: LayerMutationSlide; index: number } =>
				Boolean(entry)
			);

		const transaction = new Transaction();
		transaction.record(
			() => {
				context.slide.removeLayer(context.layer);
				if (sharedRemovalEntries.length > 0) {
					options.clearSharedLayerTracking?.(context.layer);
				}
			},
			() => {
				context.slide.addLayer(context.layer, currentIndex);
				if (sharedRemovalEntries.length > 0) {
					options.trackSharedLayer?.(context.layer);
				}
			}
		);
		sharedRemovalEntries.forEach(({ layer, slide, index }) => {
			transaction.record(
				() => {
					slide.removeLayer(layer);
				},
				() => {
					slide.addLayer(layer, index);
				}
			);
		});

		recordCommittedCommand(transaction, "current", false);
		return true;
	}

	function addTextLayer(text: string): boolean {
		const slide = options.getCurrentSlide?.() ?? null;
		const createTextLayer = options.createTextLayer;
		const normalizedText = (text ?? "").trim();
		if (!slide || !createTextLayer || !normalizedText) return false;
		const textLayer = createTextLayer(normalizedText);
		return recordLayerMutation(
			() => {
				slide.addLayer(textLayer);
				textLayer.moveTo(slide.centerX, slide.centerY);
			},
			() => {
				slide.removeLayer(textLayer);
			},
			"current"
		);
	}

	function addImageLayer(imageId: string): boolean {
		const slide = options.getCurrentSlide?.() ?? null;
		const createImageLayer = options.createImageLayer;
		if (!slide || !createImageLayer || !imageId) return false;
		const imageLayer = createImageLayer(imageId);
		if (imageLayer.originHeight > imageLayer.originWidth * 1.2) {
			imageLayer.rotation -= 90;
		}
		const initialScale = imageLayer.scale;
		return recordLayerMutation(
			() => {
				slide.addLayer(imageLayer);
				options.selectLayer?.(imageLayer);
				slide.fitLayer(imageLayer);
			},
			() => {
				slide.removeLayer(imageLayer);
				imageLayer.scale = initialScale;
			},
			"current"
		);
	}

	async function replaceSelectedImage(file: File, applyAllReferences: boolean): Promise<boolean> {
		const layer = options.getSelectedLayer();
		const registerImageFromFile = options.registerImageFromFile;
		if (!layer || !isImageLayer(layer) || !file || !registerImageFromFile) return false;
		const targetImage = layer;
		const currentImageId = targetImage.imageId;
		const nextImageId = await registerImageFromFile(file);
		if (!nextImageId) return false;

		if (applyAllReferences) {
			const transaction = new Transaction();
			const referenceLayers = options.getReferenceLayers?.() ?? [];
			referenceLayers.forEach((referenceLayer) => {
				if (!isImageLayer(referenceLayer) || referenceLayer.imageId !== currentImageId) return;
				transaction.record(
					() => {
						referenceLayer.imageId = nextImageId;
					},
					() => {
						referenceLayer.imageId = currentImageId;
					}
				);
			});
			if (transaction.length > 0) {
				recordCommittedCommand(transaction, "selection", false);
			} else {
				options.emitAfterMutation("selection", false);
			}
			return true;
		}

		return recordLayerMutation(
			() => {
				targetImage.imageId = nextImageId;
			},
			() => {
				targetImage.imageId = currentImageId;
			}
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
		spreadSelectedLayer,
		fitSelectedLayer,
		arrangeSelectedLayer,
		swapSelectedLayer,
		moveSelectedLayerToTop,
		moveSelectedLayerToBottom,
		moveSelectedLayerToIndex,
		canPasteLayer,
		canPasteLayerTransform,
		copySelectedLayer,
		cutSelectedLayer,
		pasteLayer,
		copySelectedLayerTransform,
		pasteLayerTransform,
		hasSelectedLayerSharedRemovalTargets,
		removeSelectedLayer,
		addTextLayer,
		addImageLayer,
		replaceSelectedImage,
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
