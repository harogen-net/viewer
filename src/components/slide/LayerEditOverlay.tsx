import { GestureKind, type LiveTransform } from "@/hooks/useLayerGesture";
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
//   - 4 隅 anchor + その周辺の回転エリアを描画 (D-3c)
//
// hit-test / 入力ハンドリングは親 (SlideEditView) の useLayerGesture hook が担当する。
// ハンドル要素は data-resize-anchor / data-rotate-zone を持ち、pointerdown 時に
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
//   - 4 隅 resize anchor + 各 anchor の角を中心とする回転エリア (透明な円)
//   - 専用の回転ハンドル (上辺中央の丸) は廃止した。単独で置くと小さくて見つけにくく、
//     場所を探す手間がかかっていたため、既存ハンドルの「周辺」に判定を持たせる方式にした
//   - 回転エリアは anchor より下 (zIndex 1 < 2)。ハンドル本体では resize、その周辺で回転
//   - hover 中のカーソルで回転できることを示す (ROTATE_CURSOR)
//   - 全て frame の中で配置 → frame の rotate を継承
//   - サイズ・距離は stageScale で逆補正し常時 px 固定 (HANDLE_SIZE_PX / ROTATE_ZONE_RADIUS_PX)
//   - locked layer は anchor も回転エリアも描画しない (drag 自体も hook 側で抑止)

interface LayerEditOverlayProps {
	slide: Slide;
	/** SlideEditView の stage 全体 scale (border 太さ補正に使用)。 */
	stageScale: number;
	/** layer wrapper を querySelector する起点要素。SlideView root を渡す。 */
	stageRoot: HTMLElement | null;
	/** gesture 中の live transform (selectedLayer.uuid と一致する間 frame に反映)。 */
	live?: LiveTransform | null;
	/** 進行中の gesture 種別 (回転中のカーソル固定に使う)。 */
	gestureKind?: GestureKind | null;
}

const overlayWrapStyle: CSSProperties = {
	position: "absolute",
	inset: 0,
	pointerEvents: "none",
};

const OUTLINE_THICKNESS_PX = 2;
const HANDLE_SIZE_PX = 20;
// 回転の当たり判定。各 anchor の角を中心とする半径 N px の円。
// anchor 本体 (resize) より下に敷くので、実際に回転になるのは「ハンドルの周辺」
// = 円のうち anchor の四角からはみ出した部分 (主に枠の外側)。
const ROTATE_ZONE_RADIUS_PX = 22;

// 回転カーソル。CSS に回転用の標準カーソルが無いので SVG を data URI で埋め込む。
// 白の太縁 + 黒本体で、明背景でも暗背景でも見えるようにしてある。ホットスポットは中心 (12,12)。
const ROTATE_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#fff" stroke-width="4"><path d="M18.5 12a6.5 6.5 0 1 1-1.9-4.6"/><path d="M17 3.5v4h-4"/></g><g stroke="#000" stroke-width="2"><path d="M18.5 12a6.5 6.5 0 1 1-1.9-4.6"/><path d="M17 3.5v4h-4"/></g></svg>`;
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_CURSOR_SVG)}") 12 12, grab`;

// 角を中心に円を置くための translate (nw なら左上へ半分ずらす)。
const zoneTransform = (id: string): string =>
	`translate(${id.includes("w") ? "-50%" : "50%"}, ${id.startsWith("n") ? "-50%" : "50%"})`;

// 4 隅 anchor 定義 (legacy 互換)
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
	gestureKind = null,
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
	const zoneDiameterPx = (ROTATE_ZONE_RADIUS_PX * 2) / (stageScale > 0 ? stageScale : 1);

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

	// 回転エリア: anchor の角を中心に置く透明な円。zIndex は anchor (2) より下にして、
	// ハンドル本体の上では resize が勝ち、その周辺だけが回転になるようにする。
	// 背景が transparent でもヒットテストの対象になり、border-radius は当たり判定も丸く切る。
	const baseRotateZoneStyle: CSSProperties = {
		position: "absolute",
		width: zoneDiameterPx,
		height: zoneDiameterPx,
		borderRadius: "50%",
		background: "transparent",
		cursor: ROTATE_CURSOR,
		pointerEvents: "auto",
		userSelect: "none",
		touchAction: "none",
		zIndex: 1,
	};

	const showHandles = !selectedLayer.locked;

	return (
		<div style={overlayWrapStyle} data-edit-overlay>
			{/* 回転中はカーソルを画面全体で固定する。ドラッグを始めると pointer は回転エリアの
			    外へ出てしまい、そのままだと下の要素の cursor (矢印や move) に戻ってしまうため。
			    pointer capture 中は他を操作できないので、`*` への !important で問題ない。 */}
			{gestureKind === GestureKind.ROTATE && (
				<style data-rotate-cursor-lock>{`* { cursor: ${ROTATE_CURSOR} !important; }`}</style>
			)}
			<div
				style={frameStyle}
				data-edit-selection-frame
				data-selected-layer-id={selectedLayer.id}
				data-selected-layer-uuid={selectedLayer.uuid}
				data-gesturing={useLive ? "true" : "false"}>
				{showHandles && (
					<>
						{/* 回転エリアを先に敷く (anchor より下)。DOM 順 + zIndex の両方で anchor を上にする。 */}
						{ANCHORS.map((a) => (
							<div
								key={`rot-${a.id}`}
								data-rotate-zone={a.id}
								style={{
									...baseRotateZoneStyle,
									...a.pos,
									transform: zoneTransform(a.id),
								}}
							/>
						))}
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
					</>
				)}
			</div>
		</div>
	);
};
