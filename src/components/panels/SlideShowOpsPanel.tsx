import { Button } from "@mantine/core";
import type { FC } from "react";
import { useSlideStore } from "../../state/slideStore";
import { useSlideshowStore } from "../../state/slideshowStore";

// スライドショー操作パネル (§9)。実質スタートボタンのみ。
// 設定 (interval / duration / flipX / flipY / 全画面で開始) は SlideshowSettingsModal へ分離し、

export const SlideShowOpsPanel: FC = () => {
	const slides = useSlideStore((s) => s.slides);
	const canStart = slides.filter((s) => !s.disabled).length > 0;
	const start = useSlideshowStore((s) => s.start);

	return (
		<Button
			color="red"
			size="md"
			onClick={start}
			disabled={!canStart}
			style={{ aspectRatio: 2.5, fontSize: "1.5rem" }}
			data-ss-op="start">
			▶
		</Button>
	);
};
