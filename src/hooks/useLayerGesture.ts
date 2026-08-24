import { useLayerStore } from "@/state/layerStore";
import type { Slide } from "@/types/Slide";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLayerMutation } from "./useLayerMutation";

// SlideEditView の scaled stage に bind する layer gesture hook (v4 Group D D-3b / D-3c)。
//
// 担当:
//   - pointerdown で hit-test → setSelectedLayer
//   - 同 gesture でそのまま drag (locked layer は選択のみ)
//     ただし移動は「しきい値」を超えるまで成立しない (下記)
//   - data-resize-anchor 付き element への pointerdown で 4 隅 resize (aspect 固定)
//   - data-rotate-zone 付き element (4 隅 anchor の周辺の円) への pointerdown で rotate
//     (Shift で 15° snap、通常は ROTATE_STEP_DEG = 1° 刻みに丸める)
//   - pointermove で local state の live 値を更新 → LayerEditOverlay の frame に即時反映
//   - pointerup で `useLayerMutation.updateLayer` を 1 回 commit (履歴 1 件)
//
// ドラッグ成立のしきい値 (drag のみ。resize/rotate は専用ハンドル発源なので対象外):
//   - pointerdown 直後の微動でレイヤーが動いてしまう誤操作を防ぐため、画面上で
//     DRAG_START_THRESHOLD_PX を超えて動くまで移動を成立させない。それまでは選択のみ。
//   - ただし DRAG_THRESHOLD_RELEASE_MS 経過後はしきい値を解除する。押したまま止めて
//     いられるのは誤操作ではないので、1px 単位の微調整をしきい値で塞がないための逃げ道。
//   - 判定は画面 px。slide-coord にすると同じ手の動きでもズーム倍率でしきい値が変わる。
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
	/** pointerdown の時刻 (ms)。しきい値の時間解除の起点。 */
	startedAt: number;
	/** しきい値を超えて移動が成立したか。false の間は dx/dy を 0 のままにする。 */
	active: boolean;
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

// 進行中の gesture 種別 (overlay 側でカーソル固定などに使う)。
export const GestureKind = {
	DRAG: "drag",
	RESIZE: "resize",
	ROTATE: "rotate",
} as const;
export type GestureKind = (typeof GestureKind)[keyof typeof GestureKind];

const MIN_SCALE_MUL = 0.01;
const ROTATE_SNAP_DEG = 15;
// マウス操作での回転の最小刻み。小数点以下の角度を残さない (数値入力での微調整とは別扱い)。
const ROTATE_STEP_DEG = 1;

// ドラッグ成立のしきい値 (client px、ズーム倍率に依らない画面上の実移動量)。
// pointerdown 直後の手ブレ・クリック時の微動でレイヤーが動いてしまうのを防ぐ。
// この距離を超えるまで移動を成立させない (選択だけは pointerdown 時点で成立する)。
//
// 現在値は「効いていることを手で確かめられる」大きさに振ってある。OS の慣習値は
// 4px 前後 (Windows SM_CXDRAG = 4) で、常用するならその辺まで下げる。
export const DRAG_START_THRESHOLD_PX = 20;
// pointerdown からこの時間が過ぎたら、上のしきい値を解除して微小移動も許す。
// 「1px だけ動かしたい」意図的な操作がしきい値に阻まれるのを防ぐための逃げ道
// (押したまま止めていられる = 誤操作ではない、という判定)。
//
// ここは短くしてはいけない。300ms 程度だと、狙いを定めてから動かす普通の操作でも
// 先に時間解除が効いてしまい、距離しきい値が事実上無効化される (= 誤移動が防げない)。
// 「明らかに押したまま待った」と言える長さを取る。
export const DRAG_THRESHOLD_RELEASE_MS = 1000;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export interface UseLayerGesture {
	/** drag/resize/rotate 中の live 値 (frame transform に適用)。非 gesture 中は null。 */
	live: LiveTransform | null;
	/** 進行中の gesture 種別。非 gesture 中は null。 */
	gestureKind: GestureKind | null;
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
	stageScale: number
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

// drag gesture の初期状態。active=false で始め、しきい値を超えるまで移動を成立させない。
const newDragGesture = (
	layer: { uuid: string; transX: number; transY: number; scaleX: number; scaleY: number; rotation: number },
	e: ReactPointerEvent<HTMLDivElement>
): DragGesture => ({
	kind: "drag",
	uuid: layer.uuid,
	pointerId: e.pointerId,
	base: baseOf(layer),
	startX: e.clientX,
	startY: e.clientY,
	startedAt: Date.now(),
	active: false,
	dx: 0,
	dy: 0,
});

// ドラッグを成立させてよいか。距離しきい値か、時間による解除のどちらかを満たせば成立。
const shouldActivateDrag = (g: DragGesture, clientX: number, clientY: number): boolean =>
	Math.hypot(clientX - g.startX, clientY - g.startY) >= DRAG_START_THRESHOLD_PX ||
	Date.now() - g.startedAt >= DRAG_THRESHOLD_RELEASE_MS;

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
	stageRoot: HTMLElement | null
): UseLayerGesture => {
	const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer);
	const { updateLayer } = useLayerMutation();
	const [gesture, setGesture] = useState<Gesture | null>(null);
	// 進行中の gesture を同期的に読むための控え。window 経由の pointerup (要素に届かなかった
	// ぶん) から参照するのと、要素側と window 側の二重終了を弾くのに使う。
	const gestureRef = useRef<Gesture | null>(null);
	useEffect(() => {
		gestureRef.current = gesture;
	}, [gesture]);
	// 開始は同期的に ref も更新する (直後の pointerup を取りこぼさないため)。
	const beginGesture = useCallback((g: Gesture): void => {
		gestureRef.current = g;
		setGesture(g);
	}, []);

	const startResizeOrRotate = useCallback(
		(
			e: ReactPointerEvent<HTMLDivElement>,
			mode: "resize" | "rotate",
			anchor: ResizeAnchor | null
		): boolean => {
			const sel = useLayerStore.getState().selectedLayer;
			if (!sel || sel.locked) return false;
			const layer = slide.layers.find((l) => l.uuid === sel.uuid);
			if (!layer) return false;
			if (!stageRoot) return false;
			const wrapper = stageRoot.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"]`);
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
				beginGesture({
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
				beginGesture({
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
		[slide, stageScale, stageRoot]
	);

	// 選択枠 (LayerEditOverlay の data-edit-selection-frame) 本体への pointerdown で、
	// ヒットテストを介さず「現在の選択 layer」を直接ドラッグ開始する。
	// legacy は操作用 AdjustView が常に最上位にあり、選択 layer が上位レイヤーに覆われても
	// 移動/変形できた。新側もオーバーレイ枠を最上位の操作面にすることで同等にする。
	const startDragSelected = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>): boolean => {
			const sel = useLayerStore.getState().selectedLayer;
			if (!sel) return false;
			const layer = slide.layers.find((l) => l.uuid === sel.uuid);
			if (!layer || layer.locked) return false;
			e.preventDefault();
			e.stopPropagation();
			try {
				e.currentTarget.setPointerCapture(e.pointerId);
			} catch {
				// ignore
			}
			beginGesture(newDragGesture(layer, e));
			return true;
		},
		[slide]
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
			beginGesture(newDragGesture(layer, e));
		},
		[slide, setSelectedLayer]
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
			// anchor の周辺に敷いた回転エリア (anchor 本体は上の分岐で resize として先に拾われる)
			const rotateEl = target?.closest<HTMLElement>("[data-rotate-zone]") ?? null;
			if (rotateEl) {
				if (startResizeOrRotate(e, "rotate", null)) return;
			}
			// 選択枠本体 (anchor/rotate より後にチェック): 覆われていても選択 layer を直接 drag
			const frameEl = target?.closest<HTMLElement>("[data-edit-selection-frame]") ?? null;
			if (frameEl) {
				if (startDragSelected(e)) return;
				// locked 等で drag 開始しない場合も、枠上のクリックでは選択解除しない
				return;
			}
			startDragOrHitTest(e);
		},
		[startResizeOrRotate, startDragSelected, startDragOrHitTest]
	);

	// gesture の終了 (commit + 解除)。要素側の pointerup と window 側の保険の両方から
	// 呼ばれるため、gestureRef を同期的に null にして 2 回目の呼び出しを門前払いする。
	// (layerOps.updateLayer は同値 patch を無変化として弾くので、これが無くても履歴は
	//  増えない。とはいえ「終了処理は 1 回」を状態として明示しておく。)
	const endGesture = useCallback(
		(pointerId: number) => {
			const g = gestureRef.current;
			if (!g || g.pointerId !== pointerId) return;
			gestureRef.current = null;
			setGesture(null);
			try {
				if (stageRoot?.hasPointerCapture(pointerId)) stageRoot.releasePointerCapture(pointerId);
			} catch {
				// ignore
			}
			const finalLive = computeLive(g);
			// 変化なしは commit しない (drag delta=0 / resize t=1 / rotate delta=0)
			if (g.kind === "drag" && g.dx === 0 && g.dy === 0) return;
			if (g.kind === "resize" && g.t === 1) return;
			if (g.kind === "rotate" && g.angleDeltaDeg === 0) return;
			const idx = slide.layers.findIndex((l) => l.uuid === g.uuid);
			if (idx < 0) return;
			updateLayer(idx, {
				transX: finalLive.transX,
				transY: finalLive.transY,
				scaleX: finalLive.scaleX,
				scaleY: finalLive.scaleY,
				rotation: finalLive.rotation,
			});
		},
		[slide, updateLayer, stageRoot]
	);

	const onPointerMove = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			// ボタンが押されていないのに pointermove が来た = pointerup を丸ごと取りこぼしている
			// (ウィンドウの外で離した等、window のリスナにすら届かないケース)。ここで終了させる。
			// gesture 中の buttons は必ず 1 以上なので、この判定で正規の操作を切ることはない。
			if (e.buttons === 0 && gestureRef.current?.pointerId === e.pointerId) {
				endGesture(e.pointerId);
				return;
			}
			setGesture((cur) => {
				if (!cur || cur.pointerId !== e.pointerId) return cur;
				if (cur.kind === "drag") {
					// しきい値未達の間は同一参照を返して再描画も commit も起こさない
					// (dx/dy が 0 のままなので pointerup 時の「変化なし」判定でも弾かれる)。
					if (!cur.active && !shouldActivateDrag(cur, e.clientX, e.clientY)) return cur;
					// 成立後の移動量は「しきい値を超えた地点」ではなく pointerdown 地点からの差分。
					// こうしないとカーソルとレイヤーがしきい値ぶんずれたまま最後まで追従する。
					const s = stageScale > 0 ? stageScale : 1;
					return {
						...cur,
						active: true,
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
				// 回転結果は必ず整数度に丸める (Shift 中は ROTATE_SNAP_DEG 刻み)。
				// マウス操作で小数点以下の角度が入ると、値の確認も再現もできなくなるため。
				const snap = e.shiftKey;
				const step = snap ? ROTATE_SNAP_DEG : ROTATE_STEP_DEG;
				const newRot = cur.base.rotation + deltaDeg;
				// base 自体が小数の場合 (レガシーデータ等) も、丸めた「結果」との差分を持たせる
				deltaDeg = Math.round(newRot / step) * step - cur.base.rotation;
				// 丸めた結果が変わらない微動では state を更新しない。1° 未満の pointermove が
				// そのたびに全レイヤーの再描画を起こすのを防ぐ (同一参照を返すと React は何もしない)。
				if (deltaDeg === cur.angleDeltaDeg && snap === cur.snap) return cur;
				return { ...cur, angleDeltaDeg: deltaDeg, snap };
			});
		},
		[stageScale, endGesture]
	);

	const onPointerEnd = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => endGesture(e.pointerId),
		[endGesture]
	);

	// pointerup の取りこぼし対策。stage 要素の onPointerUp だけに頼ると、
	// setPointerCapture が効かなかった場合や stage の外 (ボタンを離した先が別要素) で
	// 離した場合に終了イベントが届かず、gesture が生き残って「離したのに回り続ける」。
	// gesture 中だけ window でも拾う。二重終了は endGesture 側の ref で弾く。
	const gestureActive = gesture !== null;
	useEffect(() => {
		if (!gestureActive) return;
		const onEnd = (e: PointerEvent): void => endGesture(e.pointerId);
		window.addEventListener("pointerup", onEnd);
		window.addEventListener("pointercancel", onEnd);
		return () => {
			window.removeEventListener("pointerup", onEnd);
			window.removeEventListener("pointercancel", onEnd);
		};
	}, [gestureActive, endGesture]);

	const live = gesture ? computeLive(gesture) : null;

	return { live, gestureKind: gesture?.kind ?? null, onPointerDown, onPointerMove, onPointerEnd };
};
