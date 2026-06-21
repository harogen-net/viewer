import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useState } from "react";
import { useLayerStore } from "../state/layerStore";
import type { Slide } from "../types/Slide";
import { useLayerMutation } from "./useLayerMutation";

// SlideEditView の scaled stage に bind して、
//   1. pointerdown で hit-test → setSelectedLayer
//   2. 同 gesture でそのまま drag (locked layer は選択のみ、drag せず)
//   3. pointermove で delta 更新 (slide-coord に変換)
//   4. pointerup で `useLayerMutation.updateLayer` を 1 回 commit (履歴 1 件)
// を一括で扱う hook (v4 Group D D-3b)。
//
// delta は `(clientX - startX) / stageScale` で slide-coord 系に変換。
// drag 中の visual 反映は LayerEditOverlay に `dragDelta` を prop で渡す
// (frame の transform に加算)。

export interface DragDelta {
	uuid: string;
	dx: number;
	dy: number;
}

interface DragState extends DragDelta {
	pointerId: number;
	startX: number;
	startY: number;
	baseTransX: number;
	baseTransY: number;
}

export interface UseLayerDrag {
	/** drag 中 delta (slide-coord)。非 drag 中は null。 */
	dragDelta: DragDelta | null;
	/** scaled stage 要素に bind する handlers。 */
	onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
	onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
	onPointerEnd: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export const useLayerDrag = (slide: Slide, stageScale: number): UseLayerDrag => {
	const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer);
	const { updateLayer } = useLayerMutation();
	const [drag, setDrag] = useState<DragState | null>(null);

	const onPointerDown = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			// 左ボタン以外は無視
			if (e.button !== 0) return;
			// hit-test: target から直上の layer wrapper を辿る
			const target = e.target as HTMLElement | null;
			const wrapper = target?.closest<HTMLElement>("[data-layer-id]") ?? null;
			if (!wrapper) {
				setSelectedLayer(null);
				return;
			}
			const idStr = wrapper.dataset.layerId;
			if (!idStr) {
				setSelectedLayer(null);
				return;
			}
			const id = Number(idStr);
			const layer = slide.layers.find((l) => l.id === id) ?? null;
			if (!layer) {
				setSelectedLayer(null);
				return;
			}
			// 選択を先に確定
			setSelectedLayer(layer);
			// locked layer は選択のみ、drag しない
			if (layer.locked) return;
			e.preventDefault();
			try {
				e.currentTarget.setPointerCapture(e.pointerId);
			} catch {
				// jsdom 等で未対応でも drag 自体は継続可
			}
			setDrag({
				pointerId: e.pointerId,
				startX: e.clientX,
				startY: e.clientY,
				baseTransX: layer.transX,
				baseTransY: layer.transY,
				uuid: layer.uuid,
				dx: 0,
				dy: 0,
			});
		},
		[slide, setSelectedLayer],
	);

	const onPointerMove = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			setDrag((cur) => {
				if (!cur || cur.pointerId !== e.pointerId) return cur;
				const s = stageScale > 0 ? stageScale : 1;
				return {
					...cur,
					dx: (e.clientX - cur.startX) / s,
					dy: (e.clientY - cur.startY) / s,
				};
			});
		},
		[stageScale],
	);

	const onPointerEnd = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (!drag || e.pointerId !== drag.pointerId) return;
			try {
				e.currentTarget.releasePointerCapture(drag.pointerId);
			} catch {
				// ignore
			}
			const s = stageScale > 0 ? stageScale : 1;
			const dx = (e.clientX - drag.startX) / s;
			const dy = (e.clientY - drag.startY) / s;
			setDrag(null);
			// 移動なし (= 単純クリック) は commit しない
			if (dx === 0 && dy === 0) return;
			const idx = slide.layers.findIndex((l) => l.uuid === drag.uuid);
			if (idx < 0) return;
			updateLayer(idx, {
				transX: drag.baseTransX + dx,
				transY: drag.baseTransY + dy,
			});
		},
		[drag, slide, stageScale, updateLayer],
	);

	const dragDelta: DragDelta | null = drag
		? { uuid: drag.uuid, dx: drag.dx, dy: drag.dy }
		: null;

	return { dragDelta, onPointerDown, onPointerMove, onPointerEnd };
};
