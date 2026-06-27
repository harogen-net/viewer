import type { CSSProperties, FC, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useState } from "react";
import { useDrop } from "../../hooks/useDrop";
import { useImageLibraryMutation } from "../../hooks/useImageLibraryMutation";
import { useLayerGesture } from "../../hooks/useLayerGesture";
import { useToast } from "../../hooks/useToast";
import { useEditViewStore } from "../../state/editViewStore";
import { useLayerStore } from "../../state/layerStore";
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
// D-11: ドラッグ&ドロップ (function-list §5/§11/§13、legacy EditableSlideView の DropHelper 相当)。
//   - パレットからドラッグした imageId → placeImageOnSlide で中央 fit 配置
//   - OS ファイル (image/*) → addImageFile で library 登録 → placeImageOnSlide
//   - ドラッグ中は fit area 全体に半透明 overlay でハイライト
//   - 配置ロジックは useImageLibraryMutation、drop 振り分けは useDrop が担当
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
		scaledEl
	);

	// 画像のドラッグ&ドロップ (D-11)。imageId/ファイルいずれも中央 fit 配置。
	const { placeImageOnSlide, addImageFile } = useImageLibraryMutation();
	const toast = useToast();
	const { isOver, dropProps } = useDrop({
		onImageId: async (id) => {
			await placeImageOnSlide(id);
		},
		onFile: async (f) => {
			try {
				// 未対応形式 (HEIC 等) は addImageFile が reject → 配置せず通知。
				const id = await addImageFile(f);
				await placeImageOnSlide(id);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : String(e));
			}
		},
	});

	// キャンバスエリア外 (slide stage の外側マージン) の pointerdown で選択解除。
	// legacy EditableSlideView の obj.on("mousedown", () => selectLayerView(null)) 相当。
	// stage 内の空白クリック解除は useLayerGesture が担当するため、ここでは
	// 「outer の素地 (e.target === currentTarget) を直接クリックした時」だけ解除する
	// (zoom バーや stage 上のクリックは対象外)。
	const setSelectedLayer = useLayerStore((s) => s.setSelectedLayer);
	const handleOuterPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		if (e.target === e.currentTarget) setSelectedLayer(null);
	};

	// 外側 = fit area いっぱい、中央配置 (zoom コントロール overlay の基準に position:relative)
	const outerStyle: CSSProperties = {
		position: "relative",
		width: fitAreaWidth,
		height: fitAreaHeight,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		background: "black",
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
		background: "rgba(0,0,0,0.5)",
		border: "1px solid rgba(255,255,255,0.2)",
		borderRadius: 4,
		boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
	};
	const zoomBtnStyle: CSSProperties = {
		width: 24,
		height: 24,
		lineHeight: "22px",
		textAlign: "center",
		border: "1px solid rgba(255,255,255,0.2)",
		borderRadius: 4,
		background: "rgba(0,0,0,0.5)",
		cursor: "pointer",
		padding: 0,
		fontSize: 14,
		color: "white",
	};
	const zoomPercentStyle: CSSProperties = {
		width: 42,
		textAlign: "center",
		fontFamily: "monospace",
		fontSize: 14,
		fontWeight: 600,
		cursor: "pointer",
		userSelect: "none",
		color: "white",
	};
	const zoomPercent = Math.round(zoom * 100);
	// ドラッグ中ハイライト overlay (fit area 全体、drop イベントは下層 outer が拾う)
	const dropOverlayStyle: CSSProperties = {
		position: "absolute",
		inset: 0,
		zIndex: 20,
		display: isOver ? "flex" : "none",
		alignItems: "center",
		justifyContent: "center",
		background: "rgba(34,139,230,0.12)",
		border: "2px dashed #228be6",
		color: "#1971c2",
		fontSize: 14,
		fontWeight: 600,
		pointerEvents: "none",
	};
	// 内側 = 縮小後の slide 寸法ボックス。
	// 中央寄せは flex (justify/align center) ではなく absolute + translate(-50%,-50%) で行う。
	// 理由: ズームインで stage が outer より大きくなると、flex の "unsafe center" 挙動で
	// 開始端 (左上) 側のオーバーフローがクリップされ、中央が画面中央に保たれず
	// 中央配置レイヤーが右下へ抜けて見切れる。translate 中央寄せは stage の中心を常に
	// outer の中心へ固定し、overflow:hidden で左右対称にクリップするため倍率に依らず中央が残る。
	const stageStyle: CSSProperties = {
		position: "absolute",
		left: "50%",
		top: "50%",
		transform: "translate(-50%, -50%)",
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
		<div
			style={outerStyle}
			data-slide-edit-area
			ref={setOuterEl}
			onPointerDown={handleOuterPointerDown}
			onDragOver={dropProps.onDragOver}
			onDragLeave={dropProps.onDragLeave}
			onDrop={dropProps.onDrop}>
			{/* 編集モード限定のレイヤー画像ドロップシャドウ (legacy `.slide.editable .layerWrapper > img`)。
			    data-slide-edit-scaled 配下の image layer にのみ適用 = slideshow/thumb は影なし。 */}
			<style data-slide-edit-style>
				{`[data-slide-edit-scaled] [data-layer-type="image"] img { filter: drop-shadow(0 0 8px rgba(0, 0, 0, 1)); }`}
			</style>
			<div style={dropOverlayStyle} data-slide-drop-overlay>
				ここにドロップして画像を追加
			</div>
			<div style={stageStyle} data-slide-edit-stage>
				<div
					style={scaledStyle}
					ref={setScaledEl}
					data-slide-edit-scaled
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerEnd}
					onPointerCancel={onPointerEnd}>
					<SlideView slide={slide} bgColor={bgColor} live={live} />
					<LayerEditOverlay slide={slide} stageScale={scale} stageRoot={scaledEl} live={live} />
				</div>
			</div>
			<div style={zoomBarStyle} data-zoom-bar>
				<button
					type="button"
					style={zoomBtnStyle}
					onClick={zoomOut}
					data-zoom-op="zoom-out"
					aria-label="zoom out"
					title="ズームアウト">
					−
				</button>
				<button
					type="button"
					style={{ ...zoomPercentStyle, background: "none", border: "none" }}
					onClick={showAll}
					data-zoom-op="show-all"
					aria-label="show all"
					title="全体表示">
					{zoomPercent}%
				</button>
				<button
					type="button"
					style={zoomBtnStyle}
					onClick={zoomIn}
					data-zoom-op="zoom-in"
					aria-label="zoom in"
					title="ズームイン">
					＋
				</button>
			</div>
		</div>
	);
};
