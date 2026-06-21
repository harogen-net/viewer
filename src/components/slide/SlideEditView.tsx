import type { CSSProperties, FC } from "react";
import { useState } from "react";
import { useLayerDrag } from "../../hooks/useLayerDrag";
import { LayerEditOverlay } from "./LayerEditOverlay";
import { SlideView, type SlideViewProps } from "./SlideView";

// 編集 canvas 領域の slide 表示 FC (v4 Group D D-1 / D-3a / D-3b)。
// レガシー src/view/slide/EditableSlideView.ts (692 行 jQuery) は import せず新規実装 (§0-10)。
//
// 役割:
//   - 指定された fit area 寸法に対し fit-to-area で SlideView を縮小描画 (D-1)
//   - 内部に LayerEditOverlay を併置し、選択 layer の bbox 枠を出す (D-3a)
//   - scaled stage への pointerdown → 直上の layer wrapper を判定し setSelectedLayer + 同 gesture で drag 開始 (D-3b)
//   - 空白 pointerdown は選択解除
//
// 後の chunk で追加予定:
//   - D-3c: 4 隅 anchor で resize、rotate ハンドル
//   - D-4: ズーム (function-list §4 ズームイン/アウト/全体表示)
//
// fit-to-area: scaleX/scaleY の最小値を採用 (aspect 維持)。
// AppShell の左列 (stage) に配置される想定。
//
// 入力ハンドリングは `useLayerDrag` hook が担当 (hit-test + drag を 1 gesture に統合)。
// click イベントは使わない (pointerdown で選択 → 同 gesture でそのまま drag できるようにするため)。

interface SlideEditViewProps extends SlideViewProps {
	/** 配置可能領域の幅 (px)。slide 寸法と組合せて fit-to-area scale を決める。 */
	fitAreaWidth: number;
	/** 配置可能領域の高さ (px)。 */
	fitAreaHeight: number;
}

export const SlideEditView: FC<SlideEditViewProps> = ({
	slide,
	bgColor,
	fitAreaWidth,
	fitAreaHeight,
}) => {
	// scaled stage の DOM を LayerEditOverlay に入れるため、ref ではなく state 管理
	// (ref は代入しても re-render しないため、LayerEditOverlay の useLayoutEffect が始動しない)。
	const [scaledEl, setScaledEl] = useState<HTMLDivElement | null>(null);

	// aspect 維持の fit-to-area scale
	const scaleX = fitAreaWidth / slide.width;
	const scaleY = fitAreaHeight / slide.height;
	const scale = Math.min(scaleX, scaleY);
	const displayW = Math.round(slide.width * scale);
	const displayH = Math.round(slide.height * scale);

	// hit-test + drag を統合 (pointerdown で選択即 drag 開始)
	const { dragDelta, onPointerDown, onPointerMove, onPointerEnd } = useLayerDrag(slide, scale);

	// 外側 = fit area いっぱい、中央配置
	const outerStyle: CSSProperties = {
		width: fitAreaWidth,
		height: fitAreaHeight,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		background: "#f1f3f5",
		overflow: "hidden",
	};
	// 内側 = 縮小後の slide 寸法ボックス
	const stageStyle: CSSProperties = {
		position: "relative",
		width: displayW,
		height: displayH,
		boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.15)",
	};
	// SlideView は native 寸法で描画 → CSS scale で displayW × displayH に揃える
	// position:relative で内部 LayerEditOverlay (position:absolute) の基準にもなる。
	const scaledStyle: CSSProperties = {
		position: "relative",
		transform: `scale(${scale})`,
		transformOrigin: "top left",
		width: slide.width,
		height: slide.height,
		// drag 中のテキスト選択 / タッチスクロールを抑制
		userSelect: "none",
		touchAction: "none",
	};

	return (
		<div style={outerStyle} data-slide-edit-area>
			<div style={stageStyle} data-slide-edit-stage>
				<div
					style={scaledStyle}
					ref={setScaledEl}
					data-slide-edit-scaled
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerEnd}
					onPointerCancel={onPointerEnd}
				>
					<SlideView slide={slide} bgColor={bgColor} />
					<LayerEditOverlay
						slide={slide}
						stageScale={scale}
						stageRoot={scaledEl}
						dragDelta={dragDelta}
					/>
				</div>
			</div>
		</div>
	);
};
