import { useEditViewStore } from "@/state/editViewStore";
import { useLayerStore } from "@/state/layerStore";
import { useSlideStore } from "@/state/slideStore";
import type { ImageLayer, Layer, TextLayer } from "@/types/Layer";
import { useEffect, useRef } from "react";

// スライド遷移時に、直前に選択していたレイヤーと「対応する」レイヤーを自動選択する
// (legacy EditableSlideView.replaceSlide の autoselect 相当)。
// あわせて、legacy replaceSlide と同じく rectEdit (矩形連動編集) を自動 OFF にする
// (付けっぱなしで別スライドに意図せぬ連動が起きるのを防ぐ)。
//
// 選択優先度 (いずれも locked でなく visible なレイヤーのみ):
//   1. 同一画像レイヤー (imageId 一致) / 同一テキストレイヤー (text 一致)
//   2. 同形状 = 直前と同じスタック位置 (index) のレイヤー
//   3. 最前面 (配列末尾) のレイヤー
//
// 直前の選択 identity (lastId / lastIndex) はレイヤー選択のたびに更新する。
// slide 変更 (slideStore.setSelectedIndex → layerStore.setLayers で selectedLayer=null) の
// 後にこのフックが対応レイヤーを選び直す。

const isImage = (l: Layer): l is ImageLayer => l.type === "image";
const isText = (l: Layer): l is TextLayer => l.type === "text";
const selectable = (l: Layer): boolean => !l.locked && l.visible;

export const useLayerAutoSelect = (): void => {
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const selectedLayer = useLayerStore((s) => s.selectedLayer);
	const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer);

	// 直前選択の identity (imageId or text) と stack index を保持。
	const lastIdRef = useRef<string>("");
	const lastIndexRef = useRef<number>(-1);
	const prevSlideIndexRef = useRef<number>(selectedIndex);

	// レイヤー選択が変わるたびに「最後に選んだ identity」を記録する (null は無視 = 保持)。
	useEffect(() => {
		if (!selectedLayer) return;
		lastIdRef.current = isImage(selectedLayer)
			? selectedLayer.imageId
			: isText(selectedLayer)
				? selectedLayer.text
				: "";
		const slide = slides[selectedIndex];
		lastIndexRef.current = slide
			? slide.layers.findIndex((l) => l.uuid === selectedLayer.uuid)
			: -1;
	}, [selectedLayer, slides, selectedIndex]);

	// スライドが切り替わったら rectEdit を自動 OFF + 対応レイヤーを自動選択する。
	useEffect(() => {
		if (selectedIndex === prevSlideIndexRef.current) return;
		prevSlideIndexRef.current = selectedIndex;

		// legacy replaceSlide 準拠: スライド変更で rectEdit を解除 (付けっぱなし防止)。
		// setRectEdit 経由で store と layerOps 側ミラー (rectSyncConfig) の両方が同期される。
		if (useEditViewStore.getState().rectEdit) useEditViewStore.getState().setRectEdit(false);

		const slide = slides[selectedIndex];
		if (!slide || slide.layers.length === 0) return;

		const lastId = lastIdRef.current;
		let auto: Layer | null = null;

		// 1. 同一画像 / 同一テキスト
		if (lastId !== "") {
			auto =
				slide.layers.find(
					(l) =>
						selectable(l) &&
						((isImage(l) && l.imageId === lastId) || (isText(l) && l.text === lastId))
				) ?? null;
		}
		// 2. 同形状 = 同じ stack 位置
		if (!auto) {
			const idx = lastIndexRef.current;
			const candidate = idx >= 0 ? slide.layers[idx] : undefined;
			if (candidate && selectable(candidate)) auto = candidate;
		}
		// 3. 最前面 (配列末尾) の選択可能レイヤー
		if (!auto) {
			for (let i = slide.layers.length - 1; i >= 0; i--) {
				if (selectable(slide.layers[i])) {
					auto = slide.layers[i];
					break;
				}
			}
		}

		setSelectedLayer(auto);
	}, [selectedIndex, slides, setSelectedLayer]);
};
