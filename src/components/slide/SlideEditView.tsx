import type { CSSProperties, FC } from "react";
import { useEffect, useState } from "react";
import { useLayerGesture } from "../../hooks/useLayerGesture";
import { useEditViewStore } from "../../state/editViewStore";
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
// D-7: ズーム (function-list §4 ズームイン/アウト/全体表示)。
//   - 実効描画 scale = fit-to-area scale × editViewStore.zoom
//   - wheel で zoom 増減 (legacy EditableSlideView obj.on("wheel") 互換)
//   - 右下に − / 全体表示 / + コントロールを overlay
//
// fit-to-area: scaleX/scaleY の最小値を採用 (aspect 維持)。zoom=1.0 が「全体表示」基準。
// AppShell の左列 (stage) に配置される想定。
//
// 入力ハンドリングは `useLayerGesture` hook が担当 (hit-test + drag + resize + rotate を 1 gesture に統合)。
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
	// wheel は non-passive で listen する必要があるため outer 要素を state で保持。
	const [outerEl, setOuterEl] = useState<HTMLDivElement | null>(null);

	const zoom = useEditViewStore((s) => s.zoom);
	const setZoom = useEditViewStore((s) => s.setZoom);
	const zoomIn = useEditViewStore((s) => s.zoomIn);
	const zoomOut = useEditViewStore((s) => s.zoomOut);
	const showAll = useEditViewStore((s) => s.showAll);

	// aspect 維持の fit-to-area scale に ユーザズーム倍率を上乗せした実効 scale。
	const scaleX = fitAreaWidth / slide.width;
	const scaleY = fitAreaHeight / slide.height;
	const fitScale = Math.min(scaleX, scaleY);
	const scale = fitScale * zoom;
	const displayW = Math.round(slide.width * scale);
	const displayH = Math.round(slide.height * scale);

	// wheel ズーム (legacy EditableSlideView L66-74 互換)。
	// scale /= (1 + 0.1*sign(deltaY)): 下スクロール (deltaY>0) で縮小、上スクロールで拡大。
	// React onWheel は passive で preventDefault が効かないため native listener を non-passive で張る。
	useEffect(() => {
		if (!outerEl) return;
		const handleWheel = (e: WheelEvent) => {
			if (e.deltaY === 0) return;
			e.preventDefault();
			const dScale = 0.1 * Math.sign(e.deltaY);
			setZoom(zoom / (1 + dScale));
		};
		outerEl.addEventListener("wheel", handleWheel, { passive: false });
		return () => outerEl.removeEventListener("wheel", handleWheel);
	}, [outerEl, zoom, setZoom]);

	// hit-test + drag + resize + rotate を統合 (pointerdown で選択即 drag 開始)
	const { live, onPointerDown, onPointerMove, onPointerEnd } = useLayerGesture(
		slide,
		scale,
		scaledEl,
	);

	// 外側 = fit area いっぱい、中央配置 (zoom コントロール overlay の基準に position:relative)
	const outerStyle: CSSProperties = {
		position: "relative",
		width: fitAreaWidth,
		height: fitAreaHeight,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		background: "#f1f3f5",
		overflow: "hidden",
	};
	// 右下に固定するズームコントロール (scaled stage の外、unscaled)。
	// SlideEditView は MantineProvider 外でも単体描画される (テスト) ため素の要素で構成。
	const zoomBarStyle: CSSProperties = {
		position: "absolute",
		right: 8,
		bottom: 8,
		zIndex: 10,
		display: "flex",
		alignItems: "center",
		gap: 4,
		padding: 4,
		background: "#fff",
		border: "1px solid #dee2e6",
		borderRadius: 4,
		boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
	};
	const zoomBtnStyle: CSSProperties = {
		width: 24,
		height: 24,
		lineHeight: "22px",
		textAlign: "center",
		border: "1px solid #ced4da",
		borderRadius: 4,
		background: "#f8f9fa",
		cursor: "pointer",
		padding: 0,
		fontSize: 14,
	};
	const zoomPercentStyle: CSSProperties = {
		width: 42,
		textAlign: "center",
		fontFamily: "monospace",
		fontSize: 12,
		cursor: "pointer",
		userSelect: "none",
	};
	const zoomPercent = Math.round(zoom * 100);
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
		<div style={outerStyle} data-slide-edit-area ref={setOuterEl}>
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
						live={live}
					/>
				</div>
			</div>
			<div style={zoomBarStyle} data-zoom-bar>
				<button
					type="button"
					style={zoomBtnStyle}
					onClick={zoomOut}
					data-zoom-op="zoom-out"
					aria-label="zoom out"
					title="ズームアウト"
				>
					−
				</button>
				<button
					type="button"
					style={{ ...zoomPercentStyle, background: "none", border: "none" }}
					onClick={showAll}
					data-zoom-op="show-all"
					aria-label="show all"
					title="全体表示"
				>
					{zoomPercent}%
				</button>
				<button
					type="button"
					style={zoomBtnStyle}
					onClick={zoomIn}
					data-zoom-op="zoom-in"
					aria-label="zoom in"
					title="ズームイン"
				>
					＋
				</button>
			</div>
		</div>
	);
};
