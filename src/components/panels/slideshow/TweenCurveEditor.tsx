import { type TweenEase, TWEEN_EASE_Y1, TWEEN_EASE_Y2 } from "@/state/slideshowStore";
import type { FC, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef, useState } from "react";

// 結合スライド tween のタイミング編集 UI (§9)。
//
// 1 枚の図で「いつ動き出して、いつ動き終わって、その間どんなカーブで動くか」を扱う。
//   - 横軸 = スライドの表示時間全体 (0..1)。縦軸 = 進捗 (0 = 前スライドの位置、1 = 到達点)
//   - 前オフセット区間は y=0 の水平線 (まだ動かない)、後オフセット区間は y=1 の水平線 (もう動かない)
//   - その間だけが実アニメで、cubic-bezier のカーブを描く
//
// 掴めるものは 4 つ:
//   - 起点 (pre)  … 横だけ動く。動き出す時刻 = transition-delay
//   - 終点 (post) … 横だけ動く。動き終わる時刻 (残りが後オフセット)
//   - 制御点 P1 / P2 … カーブの形。**左右にしか動かない**。x はアニメ区間内の相対位置
//     (CSS の仕様上 0..1)。y は始点 0 / 終点 1 に固定してあり、これにより進捗が必ず
//     単調増加する = カーブが折れたり巻き戻したりしない
//
// 制御点の x をアニメ区間の相対値で持つのがポイント。前後オフセットを動かしても
// カーブの形が保たれる (CSS の cubic-bezier もアニメ区間内の相対座標なので素直に対応する)。

// 掴んでいる対象。
const Handle = {
	PRE: "pre",
	POST: "post",
	P1: "p1",
	P2: "p2",
} as const;
type Handle = (typeof Handle)[keyof typeof Handle];

// SVG の座標系 (px)。実寸は width:100% で伸縮させるので、ここは比率の基準。
const W = 320;
// 制御点が上下しなくなったので、縦は進捗 0..1 が読める最低限でよい。
// 横幅は据え置き = 描画は幅基準で伸縮するため、見かけの高さだけが 2/3 になる。
const H = 160;
const PAD_X = 18;
const PAD_Y = 18;
const PLOT_W = W - PAD_X * 2;
const PLOT_H = H - PAD_Y * 2;

// y は 0..1 のみ (制御点が上下しないので、それ以外の領域は使わない)。
const toPx = (x: number): number => PAD_X + x * PLOT_W;
const toPy = (y: number): number => PAD_Y + (1 - y) * PLOT_H;
const fromPx = (px: number): number => (px - PAD_X) / PLOT_W;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// 見た目のサイズと当たり判定のサイズを分ける。指で操作する前提だと見た目どおりの
// 大きさ (半径 7 = 実寸 13px 程度) では小さすぎるため、透明な当たり判定を上に重ねる。
const DOT_R = 7; // 見た目の丸
const DOT_HIT_R = 18; // 当たり判定 (実寸 34px 程度)
const BAR_W = 10; // 見た目の縦帯
const BAR_HIT_W = 30; // 当たり判定

const COLOR_CURVE = "#228be6";
const COLOR_STATIC = "#adb5bd";
const COLOR_CTRL = "#e8590c";

export interface TweenCurveEditorProps {
	prePercent: number;
	postPercent: number;
	ease: TweenEase;
	onChangePre: (percent: number) => void;
	onChangePost: (percent: number) => void;
	onChangeEase: (ease: TweenEase) => void;
}

export const TweenCurveEditor: FC<TweenCurveEditorProps> = ({
	prePercent,
	postPercent,
	ease,
	onChangePre,
	onChangePost,
	onChangeEase,
}) => {
	const svgRef = useRef<SVGSVGElement>(null);
	const [dragging, setDragging] = useState<Handle | null>(null);

	// アニメ区間の両端 (0..1)。
	const preX = prePercent / 100;
	const endX = 1 - postPercent / 100;
	const spanX = Math.max(0.0001, endX - preX);

	// 制御点の絶対座標 (相対 x → 図の x)。
	const c1x = preX + ease.x1 * spanX;
	const c2x = preX + ease.x2 * spanX;

	// SVG 上の pointer 位置を 0..1 の値へ。CTM を使い、拡大縮小されていても正しく取る。
	// どのハンドルも左右にしか動かないので、必要なのは x だけ。
	const pointerToX = useCallback((e: ReactPointerEvent): number | null => {
		const svg = svgRef.current;
		if (!svg) return null;
		const rect = svg.getBoundingClientRect();
		if (rect.width === 0) return null;
		// viewBox は width/height 比を保って伸縮するので、比率で px 座標へ戻す。
		return fromPx(((e.clientX - rect.left) / rect.width) * W);
	}, []);

	const beginDrag = (handle: Handle) => (e: ReactPointerEvent) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			(e.currentTarget as Element).setPointerCapture(e.pointerId);
		} catch {
			// ignore
		}
		setDragging(handle);
	};

	const onPointerMove = (e: ReactPointerEvent): void => {
		if (!dragging) return;
		const x = pointerToX(e);
		if (x === null) return;
		if (dragging === Handle.PRE) {
			// 上限は store 側でも後オフセットとの合計でクランプされる。
			onChangePre(clamp(x, 0, 1) * 100);
			return;
		}
		if (dragging === Handle.POST) {
			onChangePost(clamp(1 - x, 0, 1) * 100);
			return;
		}
		// 制御点: x はアニメ区間内の相対値へ変換 (0..1)。y は動かさない。
		const rx = clamp((x - preX) / spanX, 0, 1);
		onChangeEase(dragging === Handle.P1 ? { ...ease, x1: rx } : { ...ease, x2: rx });
	};

	const endDrag = (): void => setDragging(null);

	// 当たり判定要素の共通 props。touch-action:none はここ (タッチの開始点) にだけ付ける。
	// SVG 全体に付けるとモーダルを指でスクロールできなくなる。
	const hitProps = (handle: Handle) => ({
		onPointerDown: beginDrag(handle),
		fill: "transparent",
		// 左右にしか動かないことをカーソルでも示す。
		style: { cursor: "ew-resize", touchAction: "none" as const },
	});

	// 実アニメが占める割合 (表示用)。
	const animPercent = Math.max(0, 100 - prePercent - postPercent);

	return (
		<div data-tween-curve-editor>
			{/* biome-ignore lint/a11y/noSvgWithoutTitle: 直下に数値表示があり内容は文章で読める */}
			<svg
				ref={svgRef}
				viewBox={`0 0 ${W} ${H}`}
				// 縦スワイプはモーダルのスクロールに通す (ハンドル上のタッチだけを掴む)。
				style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
				onPointerMove={onPointerMove}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
				data-tween-curve-svg>
				{/* 進捗 0..1 の領域。制御点が上下しないのでカーブは必ずこの中に収まる。 */}
				<rect
					x={toPx(0)}
					y={toPy(1)}
					width={PLOT_W}
					height={toPy(0) - toPy(1)}
					fill="#f8f9fa"
					stroke="#dee2e6"
					strokeWidth={1}
				/>
				{/* 前オフセット / 後オフセットの帯。動かない区間であることを塗りで示す。 */}
				{prePercent > 0 && (
					<rect
						x={toPx(0)}
						y={PAD_Y}
						width={toPx(preX) - toPx(0)}
						height={PLOT_H}
						fill="rgba(173,181,189,0.18)"
						data-tween-band="pre"
					/>
				)}
				{postPercent > 0 && (
					<rect
						x={toPx(endX)}
						y={PAD_Y}
						width={toPx(1) - toPx(endX)}
						height={PLOT_H}
						fill="rgba(173,181,189,0.18)"
						data-tween-band="post"
					/>
				)}

				{/* 停止区間の水平線 (前は y=0 のまま、後は y=1 のまま)。 */}
				<line
					x1={toPx(0)}
					y1={toPy(0)}
					x2={toPx(preX)}
					y2={toPy(0)}
					stroke={COLOR_STATIC}
					strokeWidth={2}
					strokeDasharray="4 3"
				/>
				<line
					x1={toPx(endX)}
					y1={toPy(1)}
					x2={toPx(1)}
					y2={toPy(1)}
					stroke={COLOR_STATIC}
					strokeWidth={2}
					strokeDasharray="4 3"
				/>

				{/* 制御点への補助線。 */}
				<line
					x1={toPx(preX)}
					y1={toPy(0)}
					x2={toPx(c1x)}
					y2={toPy(TWEEN_EASE_Y1)}
					stroke={COLOR_CTRL}
					strokeWidth={1}
				/>
				<line
					x1={toPx(endX)}
					y1={toPy(1)}
					x2={toPx(c2x)}
					y2={toPy(TWEEN_EASE_Y2)}
					stroke={COLOR_CTRL}
					strokeWidth={1}
				/>

				{/* 実アニメのカーブ。 */}
				<path
					d={`M ${toPx(preX)} ${toPy(0)} C ${toPx(c1x)} ${toPy(TWEEN_EASE_Y1)}, ${toPx(c2x)} ${toPy(
						ease.y2
					)}, ${toPx(endX)} ${toPy(1)}`}
					fill="none"
					stroke={COLOR_CURVE}
					strokeWidth={2.5}
					data-tween-curve-path
				/>

				{/* 見た目 (操作は下の当たり判定が受ける)。 */}
				<circle
					cx={toPx(c1x)}
					cy={toPy(TWEEN_EASE_Y1)}
					r={DOT_R}
					fill="#fff"
					stroke={COLOR_CTRL}
					strokeWidth={2.5}
					pointerEvents="none"
				/>
				<circle
					cx={toPx(c2x)}
					cy={toPy(TWEEN_EASE_Y2)}
					r={DOT_R}
					fill={COLOR_CTRL}
					stroke="#fff"
					strokeWidth={2}
					pointerEvents="none"
				/>
				<rect
					x={toPx(preX) - BAR_W / 2}
					y={PAD_Y}
					width={BAR_W}
					height={PLOT_H}
					rx={3}
					fill={COLOR_CURVE}
					fillOpacity={0.25}
					stroke={COLOR_CURVE}
					strokeWidth={1.5}
					pointerEvents="none"
				/>
				<rect
					x={toPx(endX) - BAR_W / 2}
					y={PAD_Y}
					width={BAR_W}
					height={PLOT_H}
					rx={3}
					fill={COLOR_CURVE}
					fillOpacity={0.25}
					stroke={COLOR_CURVE}
					strokeWidth={1.5}
					pointerEvents="none"
				/>

				{/* 当たり判定 (透明・見た目より大きい)。重なったときは後に書いたものが勝つので、
				    掴みにくい制御点を縦帯より後ろ = 上に置く。 */}
				<rect
					x={toPx(preX) - BAR_HIT_W / 2}
					y={PAD_Y}
					width={BAR_HIT_W}
					height={PLOT_H}
					data-tween-handle="pre"
					{...hitProps(Handle.PRE)}
				/>
				<rect
					x={toPx(endX) - BAR_HIT_W / 2}
					y={PAD_Y}
					width={BAR_HIT_W}
					height={PLOT_H}
					data-tween-handle="post"
					{...hitProps(Handle.POST)}
				/>
				<circle
					cx={toPx(c1x)}
					cy={toPy(TWEEN_EASE_Y1)}
					r={DOT_HIT_R}
					data-tween-handle="p1"
					{...hitProps(Handle.P1)}
				/>
				<circle
					cx={toPx(c2x)}
					cy={toPy(TWEEN_EASE_Y2)}
					r={DOT_HIT_R}
					data-tween-handle="p2"
					{...hitProps(Handle.P2)}
				/>
			</svg>
			<div
				style={{ fontSize: 11, fontFamily: "monospace", color: "#868e96", marginTop: 4 }}
				data-tween-curve-readout>
				前 {prePercent}% / 動き {animPercent}% / 後 {postPercent}%　cubic-bezier({ease.x1},{" "}
				{ease.y1}, {ease.x2}, {ease.y2})
			</div>
		</div>
	);
};
