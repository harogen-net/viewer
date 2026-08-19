import { useSlideStore } from "@/state/slideStore";
import { useSlideshowStore } from "@/state/slideshowStore";
import { isIosDevice } from "@/utils/mobileDetect";
import { primeNoSleepVideo } from "@/utils/noSleepVideo";
import { Button } from "@mantine/core";
import type { FC } from "react";

// スライドショー操作パネル (§9)。実質スタートボタンのみ。
// 設定 (interval / duration / flipX / flipY / 全画面で開始) は SlideshowSettingsModal へ分離し、

// ▶ (U+25B6) は iOS Safari 等でフォントに依存し描画されないケースがあるため、SVG で固定化する。
const PlayIcon: FC = () => (
	<svg width="1.4em" height="1.4em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<title>Play</title>
		<path d="M8 5v14l11-7z" />
	</svg>
);

export const SlideShowOpsPanel: FC = () => {
	const slides = useSlideStore((s) => s.slides);
	const canStart = slides.filter((s) => !s.disabled).length > 0;
	const start = useSlideshowStore((s) => s.start);

	// スリープ抑止の動画再生を **このクリックのコールスタック内で** 開始する。
	// ミュートしないメディアの play() はユーザー操作内でしか通らないため、
	// SlideshowShell の effect (操作の後に走る) からでは拒否され得る。
	// 停止は SlideshowShell 側の hook が担う (開始と停止で持ち場が違うのは意図的)。
	const handleStart = (): void => {
		if (isIosDevice()) primeNoSleepVideo();
		start();
	};

	return (
		<Button
			color="red"
			size="md"
			onClick={handleStart}
			disabled={!canStart}
			style={{ aspectRatio: 2.5 }}
			data-ss-op="start">
			<PlayIcon />
		</Button>
	);
};
