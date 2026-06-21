import type { CSSProperties, FC } from "react";
import { SlideView, type SlideViewProps } from "./SlideView";

// 編集 canvas 領域の slide 表示 FC (v4 Group D D-1)。
// レガシー src/view/slide/EditableSlideView.ts (692 行 jQuery) は import せず新規実装 (§0-10)。
//
// 役割 (D-1 スコープ、最小):
//   - 指定された fit area 寸法に対し fit-to-area で SlideView を縮小描画
//   - layer は SlideView (DOM 描画) 経由で表示 (Slideshow と同じ pure 描画コア再利用)
//
// 後の chunk で追加予定:
//   - D-3: layer 編集ハンドル (drag/resize/rotate) + bounds 計算 + click hit-test
//   - D-4: ズーム (function-list §4 ズームイン/アウト/全体表示)
//   - D-5: LayerListPanel との selectedLayer 連動 (枠表示)
//
// fit-to-area: scaleX/scaleY の最小値を採用 (aspect 維持)。
// AppShell の右列に配置される想定。

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
	// aspect 維持の fit-to-area scale
	const scaleX = fitAreaWidth / slide.width;
	const scaleY = fitAreaHeight / slide.height;
	const scale = Math.min(scaleX, scaleY);
	const displayW = Math.round(slide.width * scale);
	const displayH = Math.round(slide.height * scale);

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
	const scaledStyle: CSSProperties = {
		transform: `scale(${scale})`,
		transformOrigin: "top left",
		width: slide.width,
		height: slide.height,
	};

	return (
		<div style={outerStyle} data-slide-edit-area>
			<div style={stageStyle} data-slide-edit-stage>
				<div style={scaledStyle}>
					<SlideView slide={slide} bgColor={bgColor} />
				</div>
			</div>
		</div>
	);
};
