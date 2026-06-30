import type { LiveTransform } from "@/hooks/useLayerGesture";
import { useLayerStore } from "@/state/layerStore";
import type { Slide } from "@/types/Slide";
import type { CSSProperties, FC } from "react";
import { useLayoutEffect, useState } from "react";

// 編集 canvas の選択 layer 装飾 overlay (v4 Group D D-3a/b/c)。
// レガシー src/view/layer/AdjustView.ts (jQuery 293 行) は import せず新規実装 (§0-10)。
//
// 役割 (visual only):
//   - useLayerStore.selectedLayer に対応する slide layer の bbox を計測 (D-3a)
//   - SlideView と同一の slide-coord 空間で transform を再現した選択枠を描画 (D-3a)
//   - drag/resize/rotate 中は親 (SlideEditView) から渡される live を transform に適用 (D-3b/c)
//   - 4 隅 anchor + 上部 rotate handle を描画 (D-3c)
//
// hit-test / 入力ハンドリングは親 (SlideEditView) の useLayerGesture hook が担当する。
// ハンドル要素は data-resize-anchor / data-rotate-handle を持ち、pointerdown 時に
// hook が target を検査して mode を決定する。
//
// bbox 計測:
//   - LayerView wrapper (`[data-layer-id="${id}"]`) を stageRoot から querySelector
//   - wrapper.offsetWidth/Height = transform 適用前の content intrinsic size
//   - ResizeObserver で content size 変化に追従 (image load 後の natural size 更新等)
//
// 枠の transform / サイズ:
//   - layer 自身の scale (scaleX/Y, mirrorH/V) を frame の transform には適用せず、
//     frame の width/height = contentW * |sx|, contentH * |sy| として visual size を展開する
//     (こうすることで、表示上のボーダー線幅が layer の scale に影響されず一定になる)。
//   - transform-origin: 50% 50% (legacy AdjustView と同 pivot、コンテンツ中心)
//   - layer wrapper の visual center に frame center を合わせるため translate にオフセット補正を入れる
//   - rotate のみ frame にも適用 (回転後の bbox を反映)
//
// ハンドル:
//   - 4 隅 resize anchor + 上辺中央 rotate handle
//   - 全て frame の中で配置 → frame の rotate を継承
//   - サイズ・距離は stageScale で逆補正し常時 px 固定 (HANDLE_SIZE_PX / HANDLE_GAP_PX)
//   - locked layer は anchor を描画しない (drag 自体も hook 側で抑止)

interface LayerEditOverlayProps {
	slide: Slide;
	/** SlideEditView の stage 全体 scale (border 太さ補正に使用)。 */
	stageScale: number;
	/** layer wrapper を querySelector する起点要素。SlideView root を渡す。 */
	stageRoot: HTMLElement | null;
	/** gesture 中の live transform (selectedLayer.uuid と一致する間 frame に反映)。 */
	live?: LiveTransform | null;
}

const overlayWrapStyle: CSSProperties = {
	position: "absolute",
	inset: 0,
	pointerEvents: "none",
};

const OUTLINE_THICKNESS_PX = 2;
const HANDLE_SIZE_PX = 20;
const ROTATE_HANDLE_GAP_PX = 24;

// 4 隅 anchor 定義 (legacy css/index.css L620-665 互換)
//   - 位置: 角に貼り付け (translate しない) → anchor の box がフレーム内側に収まる
//   - 色: nw=orange / ne=red / sw=blue / se=green
//   - cursor: 方向別 (nw-resize / ne-resize / sw-resize / se-resize)
const ANCHORS: {
	id: "nw" | "ne" | "sw" | "se";
	pos: { top?: 0; bottom?: 0; left?: 0; right?: 0 };
	bg: string;
	cursor: string;
}[] = [
	{ id: "nw", pos: { top: 0, left: 0 }, bg: "orange", cursor: "nw-resize" },
	{ id: "ne", pos: { top: 0, right: 0 }, bg: "red", cursor: "ne-resize" },
	{ id: "sw", pos: { bottom: 0, left: 0 }, bg: "blue", cursor: "sw-resize" },
	{ id: "se", pos: { bottom: 0, right: 0 }, bg: "green", cursor: "se-resize" },
];

export const LayerEditOverlay: FC<LayerEditOverlayProps> = ({
	slide,
	stageScale,
	stageRoot,
	live = null,
}) => {
	const selectedLayer = useLayerStore((s) => s.selectedLayer);

	// 計測値に uuid を紐付け、現選択 layer と一致しない間 1 frame は描画をスキップする
	// (これがないと selectedLayer 変更後の初回 render で「旧 size + 新 transform」 の枠が
	//  1 フレーム描画されてアウトラインがちらつく)。
	const [measured, setMeasured] = useState<{
		uuid: string;
		w: number;
		h: number;
	} | null>(null);

	// 選択 layer の content size 計測。
	// useLayoutEffect: browser paint 前に同期実行されるため、選択 → 検出 → 計測 → 描画 が
	// 1 フレーム内に収まり、選択枠のチラツきが出ない。
	useLayoutEffect(() => {
		if (!selectedLayer || !stageRoot) {
			setMeasured(null);
			return;
		}
		// 別 slide の選択 layer (slide 切替直後等) はスキップ
		if (!slide.layers.some((l) => l.uuid === selectedLayer.uuid)) {
			setMeasured(null);
			return;
		}
		const wrapper = stageRoot.querySelector<HTMLElement>(`[data-layer-id="${selectedLayer.id}"]`);
		if (!wrapper) {
			setMeasured(null);
			return;
		}
		const uuid = selectedLayer.uuid;
		const measure = () => {
			setMeasured({ uuid, w: wrapper.offsetWidth, h: wrapper.offsetHeight });
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(wrapper);
		return () => ro.disconnect();
	}, [selectedLayer, slide, stageRoot]);

	// 計測値の uuid が現選択と不一致 (増分 render 間のステール) なら描画しない
	const validMeasured =
		selectedLayer && measured && measured.uuid === selectedLayer.uuid ? measured : null;

	// 選択無し or 計測未確定時は overlay コンテナだけ出す (test の存在判定で使用)
	if (!selectedLayer || !validMeasured) {
		return <div style={overlayWrapStyle} data-edit-overlay />;
	}

	// gesture 中で uuid 一致なら live、それ以外は base layer
	const useLive = live && live.uuid === selectedLayer.uuid ? live : null;
	const transX = useLive?.transX ?? selectedLayer.transX;
	const transY = useLive?.transY ?? selectedLayer.transY;
	const scaleX = useLive?.scaleX ?? selectedLayer.scaleX;
	const scaleY = useLive?.scaleY ?? selectedLayer.scaleY;
	const rotation = useLive?.rotation ?? selectedLayer.rotation;

	const absSx = Math.abs(scaleX);
	const absSy = Math.abs(scaleY);
	// visual size: layer の scale を展開して frame の幅高に反映
	const visW = validMeasured.w * absSx;
	const visH = validMeasured.h * absSy;
	// visual center を layer wrapper の visual center に合わせるためのオフセット
	const offX = (validMeasured.w - visW) / 2;
	const offY = (validMeasured.h - visH) / 2;
	// transform: translate (visual center 合わせ) → rotate のみ。scale は frame サイズへ展開済み
	const transform = `translate(${transX + offX}px, ${transY + offY}px) rotate(${rotation}deg)`;
	const outlinePx =
		stageScale > 0 ? Math.max(OUTLINE_THICKNESS_PX / stageScale, 1) : OUTLINE_THICKNESS_PX;
	// stage 全体が scale(stageScale) されているため、ハンドルの「画面上 px 固定」化に逆補正
	const handlePx = stageScale > 0 ? HANDLE_SIZE_PX / stageScale : HANDLE_SIZE_PX;
	const rotateGapPx = stageScale > 0 ? ROTATE_HANDLE_GAP_PX / stageScale : ROTATE_HANDLE_GAP_PX;

	const frameStyle: CSSProperties = {
		position: "absolute",
		left: 0,
		top: 0,
		width: visW,
		height: visH,
		transform,
		transformOrigin: "50% 50%",
		outline: `${outlinePx}px solid blue`,
		// outline: `${outlinePx}px solid rgba(255, 0, 0, 0.5)`,
		outlineOffset: `-${outlinePx}px`,
		boxSizing: "border-box",
		// 操作面として pointer を捕捉する (legacy の最上位 AdjustView 相当)。
		// オーバーレイは content より上に描画されるため、選択 layer が上位レイヤーに
		// 覆われていても枠上の pointerdown で drag できる (吸われない)。
		// 枠上の pointerdown は useLayerGesture が data-edit-selection-frame を見て
		// 「選択 layer の直接 drag」に振り分ける (locked は drag 抑止)。
		pointerEvents: "auto",
		cursor: selectedLayer.locked ? "default" : "move",
		touchAction: "none",
	};

	// legacy .slide.editable .anchor: 20x20, background-color のみ、border なし
	const baseAnchorStyle: CSSProperties = {
		position: "absolute",
		width: handlePx,
		height: handlePx,
		boxSizing: "border-box",
		pointerEvents: "auto",
		userSelect: "none",
		touchAction: "none",
		zIndex: 2,
	};

	const rotateHandleStyle: CSSProperties = {
		position: "absolute",
		left: "50%",
		top: 0,
		width: handlePx,
		height: handlePx,
		// 上辺中央から ROTATE_HANDLE_GAP_PX だけ外側に出す
		transform: `translate(-50%, calc(-100% - ${rotateGapPx}px))`,
		background: "#fff",
		border: `${Math.max(1 / Math.max(stageScale, 0.0001), 1)}px solid #228be6`,
		borderRadius: "50%",
		boxSizing: "border-box",
		cursor: "grab",
		pointerEvents: "auto",
		userSelect: "none",
		touchAction: "none",
		zIndex: 2,
	};

	const showHandles = !selectedLayer.locked;

	return (
		<div style={overlayWrapStyle} data-edit-overlay>
			<div
				style={frameStyle}
				data-edit-selection-frame
				data-selected-layer-id={selectedLayer.id}
				data-selected-layer-uuid={selectedLayer.uuid}
				data-gesturing={useLive ? "true" : "false"}>
				{showHandles && (
					<>
						{ANCHORS.map((a) => (
							<div
								key={a.id}
								data-resize-anchor={a.id}
								style={{
									...baseAnchorStyle,
									...a.pos,
									background: a.bg,
									cursor: a.cursor,
								}}
							/>
						))}
						<div data-rotate-handle style={rotateHandleStyle} />
					</>
				)}
			</div>
		</div>
	);
};
