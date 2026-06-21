import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useState } from "react";
import { useLayerStore } from "../state/layerStore";
import type { Slide } from "../types/Slide";
import { useLayerMutation } from "./useLayerMutation";

// SlideEditView の scaled stage に bind する layer gesture hook (v4 Group D D-3b / D-3c)。
//
// 担当:
//   - pointerdown で hit-test → setSelectedLayer
//   - 同 gesture でそのまま drag (locked layer は選択のみ)
//   - data-resize-anchor 付き element への pointerdown で 4 隅 resize (aspect 固定)
//   - data-rotate-handle 付き element への pointerdown で rotate (Shift で 15° snap)
//   - pointermove で local state の live 値を更新 → LayerEditOverlay の frame に即時反映
//   - pointerup で `useLayerMutation.updateLayer` を 1 回 commit (履歴 1 件)
//
// 座標系:
//   - slide-coord 系 = SlideView の native 寸法 (transform 適用前)。
//     pointer の clientX/Y は (clientX - stageRect.left) / stageScale で変換。
//   - delta のみで足りる drag は (clientX - startX) / stageScale で局所変換可。
//   - resize は pivot が必要なので基準時 stageRect.left/top を保存。
//
// resize 数学:
//   - pivot = 反対角 corner の slide-coord 位置 (gesture 開始時に固定)
//   - local diagonal vector d = (signX * baseVisW, signY * baseVisH)
//   - V = pointer_slide - pivot
//   - V' = R(-rotation) * V (逆回転で local 系へ)
//   - t = (V' · d) / (|d|^2)  ← d 方向への射影 / d の長さ (= 新 / 旧 比)
//   - 新 scaleX = baseScaleX * t (sign 保存)、新 scaleY = baseScaleY * t
//   - 新 center = pivot + R(rotation) * (signX * baseVisW/2 * t, signY * baseVisH/2 * t)
//   - 新 transX/Y = newCenter - (contentW/2, contentH/2)
//   - t は MIN_SCALE_MUL で clamp (degenerate 回避)
//
// rotate 数学:
//   - pivot = visual center (= transX + contentW/2, transY + contentH/2) at base
//   - startAngle = atan2(startPointer - center)
//   - currentAngle = atan2(currentPointer - center)
//   - delta = currentAngle - startAngle (radians)
//   - newRotation = baseRotation + delta_deg
//   - Shift 押下時は ROTATE_SNAP_DEG (= 15°) 刻みに round

export interface LiveTransform {
	uuid: string;
	transX: number;
	transY: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
}

interface BaseTransform {
	transX: number;
	transY: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
}

type ResizeAnchor = "nw" | "ne" | "sw" | "se";

interface CommonGesture {
	uuid: string;
	pointerId: number;
	base: BaseTransform;
}

interface DragGesture extends CommonGesture {
	kind: "drag";
	startX: number;
	startY: number;
	dx: number;
	dy: number;
}

interface ResizeGesture extends CommonGesture {
	kind: "resize";
	anchor: ResizeAnchor;
	contentW: number;
	contentH: number;
	baseVisW: number;
	baseVisH: number;
	signX: 1 | -1;
	signY: 1 | -1;
	pivotX: number;
	pivotY: number;
	stageLeft: number;
	stageTop: number;
	t: number; // 倍率 (1 = 等倍)
}

interface RotateGesture extends CommonGesture {
	kind: "rotate";
	contentW: number;
	contentH: number;
	centerX: number;
	centerY: number;
	startAngle: number; // radians
	stageLeft: number;
	stageTop: number;
	angleDeltaDeg: number;
	snap: boolean; // Shift 押下中
}

type Gesture = DragGesture | ResizeGesture | RotateGesture;

const MIN_SCALE_MUL = 0.01;
const ROTATE_SNAP_DEG = 15;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export interface UseLayerGesture {
	/** drag/resize/rotate 中の live 値 (frame transform に適用)。非 gesture 中は null。 */
	live: LiveTransform | null;
	/** scaled stage 要素に bind する handlers。 */
	onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
	onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
	onPointerEnd: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

// slide-coord に変換 (stage 左上原点 → slide 原点)
const toSlideCoord = (
	clientX: number,
	clientY: number,
	stageLeft: number,
	stageTop: number,
	stageScale: number,
): { x: number; y: number } => {
	const s = stageScale > 0 ? stageScale : 1;
	return {
		x: (clientX - stageLeft) / s,
		y: (clientY - stageTop) / s,
	};
};

const baseOf = (layer: {
	transX: number;
	transY: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
}): BaseTransform => ({
	transX: layer.transX,
	transY: layer.transY,
	scaleX: layer.scaleX,
	scaleY: layer.scaleY,
	rotation: layer.rotation,
});

// live transform 計算 (gesture state から live 値を導出)
const computeLive = (g: Gesture): LiveTransform => {
	if (g.kind === "drag") {
		return {
			uuid: g.uuid,
			transX: g.base.transX + g.dx,
			transY: g.base.transY + g.dy,
			scaleX: g.base.scaleX,
			scaleY: g.base.scaleY,
			rotation: g.base.rotation,
		};
	}
	if (g.kind === "resize") {
		const t = g.t;
		const newScaleX = g.base.scaleX * t;
		const newScaleY = g.base.scaleY * t;
		// 新 center = pivot + R(rotation) * (signX * baseVisW/2 * t, signY * baseVisH/2 * t)
		const rotRad = toRad(g.base.rotation);
		const cos = Math.cos(rotRad);
		const sin = Math.sin(rotRad);
		const offLX = (g.signX * g.baseVisW * t) / 2;
		const offLY = (g.signY * g.baseVisH * t) / 2;
		const newCenterX = g.pivotX + cos * offLX - sin * offLY;
		const newCenterY = g.pivotY + sin * offLX + cos * offLY;
		return {
			uuid: g.uuid,
			transX: newCenterX - g.contentW / 2,
			transY: newCenterY - g.contentH / 2,
			scaleX: newScaleX,
			scaleY: newScaleY,
			rotation: g.base.rotation,
		};
	}
	// rotate
	return {
		uuid: g.uuid,
		transX: g.base.transX,
		transY: g.base.transY,
		scaleX: g.base.scaleX,
		scaleY: g.base.scaleY,
		rotation: g.base.rotation + g.angleDeltaDeg,
	};
};

export const useLayerGesture = (
	slide: Slide,
	stageScale: number,
	stageRoot: HTMLElement | null,
): UseLayerGesture => {
	const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer);
	const { updateLayer } = useLayerMutation();
	const [gesture, setGesture] = useState<Gesture | null>(null);

	const startResizeOrRotate = useCallback(
		(
			e: ReactPointerEvent<HTMLDivElement>,
			mode: "resize" | "rotate",
			anchor: ResizeAnchor | null,
		): boolean => {
			const sel = useLayerStore.getState().selectedLayer;
			if (!sel || sel.locked) return false;
			const layer = slide.layers.find((l) => l.uuid === sel.uuid);
			if (!layer) return false;
			if (!stageRoot) return false;
			const wrapper = stageRoot.querySelector<HTMLElement>(
				`[data-layer-id="${layer.id}"]`,
			);
			if (!wrapper) return false;
			const contentW = wrapper.offsetWidth;
			const contentH = wrapper.offsetHeight;
			if (contentW <= 0 || contentH <= 0) return false;

			e.preventDefault();
			e.stopPropagation();
			const stageRect = e.currentTarget.getBoundingClientRect();
			try {
				e.currentTarget.setPointerCapture(e.pointerId);
			} catch {
				// ignore
			}

			const base = baseOf(layer);
			if (mode === "resize" && anchor) {
				const signX: 1 | -1 = anchor === "ne" || anchor === "se" ? 1 : -1;
				const signY: 1 | -1 = anchor === "sw" || anchor === "se" ? 1 : -1;
				const baseVisW = contentW * Math.abs(base.scaleX);
				const baseVisH = contentH * Math.abs(base.scaleY);
				const baseCenterX = base.transX + contentW / 2;
				const baseCenterY = base.transY + contentH / 2;
				const rotRad = toRad(base.rotation);
				const cos = Math.cos(rotRad);
				const sin = Math.sin(rotRad);
				// pivot = base center + R(rotation) * (-signX * baseVisW/2, -signY * baseVisH/2)
				const pivotOffLX = (-signX * baseVisW) / 2;
				const pivotOffLY = (-signY * baseVisH) / 2;
				const pivotX = baseCenterX + cos * pivotOffLX - sin * pivotOffLY;
				const pivotY = baseCenterY + sin * pivotOffLX + cos * pivotOffLY;
				setGesture({
					kind: "resize",
					uuid: layer.uuid,
					pointerId: e.pointerId,
					base,
					anchor,
					contentW,
					contentH,
					baseVisW,
					baseVisH,
					signX,
					signY,
					pivotX,
					pivotY,
					stageLeft: stageRect.left,
					stageTop: stageRect.top,
					t: 1,
				});
			} else {
				const baseCenterX = base.transX + contentW / 2;
				const baseCenterY = base.transY + contentH / 2;
				const p = toSlideCoord(e.clientX, e.clientY, stageRect.left, stageRect.top, stageScale);
				const startAngle = Math.atan2(p.y - baseCenterY, p.x - baseCenterX);
				setGesture({
					kind: "rotate",
					uuid: layer.uuid,
					pointerId: e.pointerId,
					base,
					contentW,
					contentH,
					centerX: baseCenterX,
					centerY: baseCenterY,
					startAngle,
					stageLeft: stageRect.left,
					stageTop: stageRect.top,
					angleDeltaDeg: 0,
					snap: e.shiftKey,
				});
			}
			return true;
		},
		[slide, stageScale, stageRoot],
	);

	const startDragOrHitTest = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
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
			setSelectedLayer(layer);
			if (layer.locked) return;
			e.preventDefault();
			try {
				e.currentTarget.setPointerCapture(e.pointerId);
			} catch {
				// ignore
			}
			setGesture({
				kind: "drag",
				uuid: layer.uuid,
				pointerId: e.pointerId,
				base: baseOf(layer),
				startX: e.clientX,
				startY: e.clientY,
				dx: 0,
				dy: 0,
			});
		},
		[slide, setSelectedLayer],
	);

	const onPointerDown = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (e.button !== 0) return;
			const target = e.target as HTMLElement | null;
			const anchorEl = target?.closest<HTMLElement>("[data-resize-anchor]") ?? null;
			if (anchorEl) {
				const anchor = anchorEl.dataset.resizeAnchor as ResizeAnchor | undefined;
				if (anchor === "nw" || anchor === "ne" || anchor === "sw" || anchor === "se") {
					if (startResizeOrRotate(e, "resize", anchor)) return;
				}
			}
			const rotateEl = target?.closest<HTMLElement>("[data-rotate-handle]") ?? null;
			if (rotateEl) {
				if (startResizeOrRotate(e, "rotate", null)) return;
			}
			startDragOrHitTest(e);
		},
		[startResizeOrRotate, startDragOrHitTest],
	);

	const onPointerMove = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			setGesture((cur) => {
				if (!cur || cur.pointerId !== e.pointerId) return cur;
				if (cur.kind === "drag") {
					const s = stageScale > 0 ? stageScale : 1;
					return {
						...cur,
						dx: (e.clientX - cur.startX) / s,
						dy: (e.clientY - cur.startY) / s,
					};
				}
				if (cur.kind === "resize") {
					const p = toSlideCoord(e.clientX, e.clientY, cur.stageLeft, cur.stageTop, stageScale);
					const vx = p.x - cur.pivotX;
					const vy = p.y - cur.pivotY;
					// 逆回転で local 系へ
					const rotRad = toRad(cur.base.rotation);
					const cos = Math.cos(rotRad);
					const sin = Math.sin(rotRad);
					const vlx = cos * vx + sin * vy;
					const vly = -sin * vx + cos * vy;
					// d = (signX * baseVisW, signY * baseVisH)、|d|^2 = baseVisW^2 + baseVisH^2
					const diag2 = cur.baseVisW * cur.baseVisW + cur.baseVisH * cur.baseVisH;
					if (diag2 === 0) return cur;
					const dot = vlx * cur.signX * cur.baseVisW + vly * cur.signY * cur.baseVisH;
					let t = dot / diag2;
					if (t < MIN_SCALE_MUL) t = MIN_SCALE_MUL;
					return { ...cur, t };
				}
				// rotate
				const p = toSlideCoord(e.clientX, e.clientY, cur.stageLeft, cur.stageTop, stageScale);
				const angle = Math.atan2(p.y - cur.centerY, p.x - cur.centerX);
				let deltaDeg = toDeg(angle - cur.startAngle);
				// 正規化 (-180, 180]
				while (deltaDeg > 180) deltaDeg -= 360;
				while (deltaDeg <= -180) deltaDeg += 360;
				const snap = e.shiftKey;
				if (snap) {
					const newRot = cur.base.rotation + deltaDeg;
					const snapped = Math.round(newRot / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
					deltaDeg = snapped - cur.base.rotation;
				}
				return { ...cur, angleDeltaDeg: deltaDeg, snap };
			});
		},
		[stageScale],
	);

	const onPointerEnd = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (!gesture || gesture.pointerId !== e.pointerId) return;
			try {
				e.currentTarget.releasePointerCapture(gesture.pointerId);
			} catch {
				// ignore
			}
			const finalLive = computeLive(gesture);
			setGesture(null);
			// 変化なしは commit しない (drag delta=0 / resize t=1 / rotate delta=0)
			if (gesture.kind === "drag" && gesture.dx === 0 && gesture.dy === 0) return;
			if (gesture.kind === "resize" && gesture.t === 1) return;
			if (gesture.kind === "rotate" && gesture.angleDeltaDeg === 0) return;
			const idx = slide.layers.findIndex((l) => l.uuid === gesture.uuid);
			if (idx < 0) return;
			updateLayer(idx, {
				transX: finalLive.transX,
				transY: finalLive.transY,
				scaleX: finalLive.scaleX,
				scaleY: finalLive.scaleY,
				rotation: finalLive.rotation,
			});
		},
		[gesture, slide, updateLayer],
	);

	const live = gesture ? computeLive(gesture) : null;

	return { live, onPointerDown, onPointerMove, onPointerEnd };
};
