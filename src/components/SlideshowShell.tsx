import type { CSSProperties, FC } from "react";
import { useEffect, useState } from "react";
import { useSlideshow } from "../hooks/useSlideshow";
import { useSlideStore } from "../state/slideStore";
import { useViewerDocumentStore } from "../state/viewerDocumentStore";
import { SlideView } from "./slide/SlideView";

// スライドショー全画面シェル (v3 Group A build 5、§0-10 新側内製)。
// レガシー src/viewController/SlideShowViewController.ts (jQuery + new DOMSlideView)
// は import せず新規実装。
//
// 役割: open=true でビューポート全面を黒で覆い、現在の slide を viewport に
// 縮小フィットさせて描画し、prev / next / close / play・pause 操作を提供する。
// auto-advance タイマーは build 6 で追加した hooks/useSlideshow に委譲。

interface SlideshowShellProps {
	open: boolean;
	onClose: () => void;
}

const overlayStyle: CSSProperties = {
	position: "fixed",
	inset: 0,
	zIndex: 9999,
	background: "#000",
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	overflow: "hidden",
};

const controlsStyle: CSSProperties = {
	position: "fixed",
	bottom: 16,
	left: "50%",
	transform: "translateX(-50%)",
	display: "flex",
	gap: 8,
	alignItems: "center",
	padding: "6px 12px",
	background: "rgba(255,255,255,0.85)",
	color: "#000",
	fontFamily: "monospace",
	fontSize: 13,
	borderRadius: 4,
	userSelect: "none",
};

const btnStyle: CSSProperties = {
	background: "transparent",
	border: "1px solid #444",
	padding: "2px 8px",
	cursor: "pointer",
	fontFamily: "inherit",
};

export const SlideshowShell: FC<SlideshowShellProps> = ({ open, onClose }) => {
	const slides = useSlideStore((s) => s.slides);
	const meta = useViewerDocumentStore((s) => s.meta);
	const bgColor = meta?.bgColor;
	const intervalMs = meta?.interval ?? 0;
	const [index, setIndex] = useState(0);
	const [playing, setPlaying] = useState(true);
	const [scale, setScale] = useState(1);

	const current = slides[index];

	// open になったら index/playing をリセット、slides が変わっても同様。
	useEffect(() => {
		if (open) {
			setIndex(0);
			setPlaying(true);
		}
	}, [open, slides]);

	// auto-advance タイマー (build 6 hooks/useSlideshow に委譲)。
	useSlideshow({ enabled: open && playing, slides, index, setIndex, intervalMs });

	// 現在 slide のサイズをビューポートにフィット (短辺基準で縮小、拡大はしない)。
	useEffect(() => {
		if (!open || !current) return;
		const compute = () => {
			const sx = window.innerWidth / current.width;
			const sy = window.innerHeight / current.height;
			setScale(Math.min(sx, sy, 1));
		};
		compute();
		window.addEventListener("resize", compute);
		return () => window.removeEventListener("resize", compute);
	}, [open, current]);

	// キーボード: ESC で閉じる、←/→ で前後。
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
			else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
			else if (e.key === "ArrowRight") setIndex((i) => Math.min(slides.length - 1, i + 1));
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose, slides.length]);

	if (!open) return null;

	if (slides.length === 0) {
		return (
			<div style={overlayStyle}>
				<div style={{ color: "#fff", fontFamily: "monospace" }}>スライドがありません</div>
				<div style={controlsStyle}>
					<button type="button" style={btnStyle} onClick={onClose}>× close</button>
				</div>
			</div>
		);
	}

	const slide = current ?? slides[0];

	return (
		<div style={overlayStyle}>
			<div style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}>
				<SlideView slide={slide} bgColor={bgColor} />
			</div>
			<div style={controlsStyle}>
				<button type="button" style={btnStyle} onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
					← prev
				</button>
				<button
					type="button"
					style={btnStyle}
					onClick={() => setPlaying((p) => !p)}
					disabled={intervalMs <= 0}
					title={intervalMs <= 0 ? "interval 未設定のため自動進行不可" : ""}
				>
					{playing ? "❚❚ pause" : "▶ play"}
				</button>
				<span>
					{index + 1} / {slides.length}
				</span>
				<button
					type="button"
					style={btnStyle}
					onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
					disabled={index >= slides.length - 1}
				>
					next →
				</button>
				<button type="button" style={btnStyle} onClick={onClose}>
					× close
				</button>
			</div>
		</div>
	);
};
