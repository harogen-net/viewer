import { Button, Paper, Stack, Title } from "@mantine/core";
import type { FC } from "react";
import { useSlideStore } from "../../state/slideStore";
import { useSlideshowStore } from "../../state/slideshowStore";

// スライドショー操作パネル (§9)。実質スタートボタンのみ。
// 設定 (interval / duration / flipX / flipY / 全画面で開始) は SlideshowSettingsModal へ分離し、
// オープンボタンは AppShell TopBar (画像ライブラリの下) に置く。

export const SlideShowOpsPanel: FC = () => {
	const slideCount = useSlideStore((s) => s.slides.length);
	const start = useSlideshowStore((s) => s.start);

	return (
		<Paper withBorder p="sm" radius="sm" data-slideshow-ops>
			<Stack gap="xs">
				<Title order={5}>SlideShow</Title>
				<Button
					color="red"
					size="sm"
					onClick={start}
					disabled={slideCount === 0}
					data-ss-op="start">
					▶
				</Button>
			</Stack>
		</Paper>
	);
};
