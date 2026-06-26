import { Modal, SimpleGrid, Text } from "@mantine/core";
import type { CSSProperties, FC } from "react";
import { useEffect, useRef, useState } from "react";
import type { StoredDocThumbnail, StoredSlideTitle } from "../../hooks/useStorage";

// 保存ドキュメントを「見た目で選ぶ」ビジュアルピッカー (v4 Group D 補間、§0-10 新側内製)。
// FileIOPanel の <Select> を補完する、サムネ + タイトルのギャラリー。
//   - titles: 表示する一覧 (呼び出し側で update 降順ソート済みを渡す)
//   - thumbnails: {title: {thumb(連結1枚), frames(コマ数)}}。未生成 title は欠落 → N/A 表示
//   - カードクリックで onPick(title) (呼び出し側でロード + close)
//   - サムネは横連結1枚画像。通常 1 コマ目、ホバーで順次コマ送り (ThumbnailStrip)
//
// 責務分離 (SlideView/SortableSlideThumb と同方針):
//   - DocumentPickerGrid  = カード描画コア (Modal を知らない = jsdom で素直にテストできる)
//   - DocumentPickerModal = Modal ラッパー (開閉アニメーションあり、薄い配線のみ)

interface DocumentPickerGridProps {
	titles: StoredSlideTitle[];
	thumbnails: Record<string, StoredDocThumbnail>;
	selectedTitle: string | null;
	onPick: (title: string) => void;
}

// ホバーでコマ送りする間隔 (ms)。
const CYCLE_MS = 600;

const cardStyle = (selected: boolean): CSSProperties => ({
	display: "flex",
	flexDirection: "column",
	gap: 4,
	padding: 6,
	border: selected ? "2px solid #228be6" : "1px solid #dee2e6",
	borderRadius: 6,
	background: selected ? "rgba(34,139,230,0.06)" : "#fff",
	cursor: "pointer",
	textAlign: "left",
	width: "100%",
});
// サムネ表示枠 (自由比率、contain で全体表示)。N/A も同枠で揃える。
const thumbBoxStyle: CSSProperties = {
	width: "100%",
	height: 160,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	background: "#f1f3f5",
	borderRadius: 4,
	overflow: "hidden",
};
const titleStyle: CSSProperties = {
	fontSize: 11,
	fontFamily: "monospace",
	whiteSpace: "nowrap",
	overflow: "hidden",
	textOverflow: "ellipsis",
};

// 連結1枚サムネを 1 コマだけ見せ、ホバーで順次コマ送りする表示要素。
// background-size 横 = frames*100% で 1 コマ = ボックス幅。position-x を frame/(frames-1) で送る。
const ThumbnailStrip: FC<{ thumb: string; frames: number; alt: string }> = ({
	thumb,
	frames,
	alt,
}) => {
	const [frame, setFrame] = useState(0);
	const timerRef = useRef<number | null>(null);
	// サムネ差し替え時は先頭コマへ。
	useEffect(() => setFrame(0), [thumb]);
	// アンマウント時に timer を必ず止める。
	useEffect(() => () => stop(), []);

	function stop(): void {
		if (timerRef.current != null) {
			window.clearInterval(timerRef.current);
			timerRef.current = null;
		}
	}
	const start = (): void => {
		if (frames <= 1 || timerRef.current != null) return;
		timerRef.current = window.setInterval(() => setFrame((f) => (f + 1) % frames), CYCLE_MS);
	};
	const reset = (): void => {
		stop();
		setFrame(0);
	};

	const style: CSSProperties = {
		...thumbBoxStyle,
		background: undefined,
		backgroundColor: "#f1f3f5",
		backgroundImage: `url(${thumb})`,
		backgroundRepeat: "no-repeat",
		backgroundSize: `${frames * 100}% 100%`,
		backgroundPosition: frames > 1 ? `${(frame / (frames - 1)) * 100}% 0` : "0 0",
	};
	return (
		<div
			style={style}
			onMouseOver={start}
			onMouseOut={reset}
			data-picker-thumb
			data-thumb-frames={frames}
			data-thumb-frame={frame}
			aria-label={alt}
		/>
	);
};

export const DocumentPickerGrid: FC<DocumentPickerGridProps> = ({
	titles,
	thumbnails,
	selectedTitle,
	onPick,
}) => {
	if (titles.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				保存済みドキュメントがありません。
			</Text>
		);
	}
	return (
		<SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="sm" verticalSpacing="sm">
			{titles.map((t) => {
				const dt = thumbnails[t.title];
				const selected = t.title === selectedTitle;
				return (
					<button
						type="button"
						key={t.id}
						style={cardStyle(selected)}
						data-picker-item={t.title}
						data-selected={selected ? "true" : "false"}
						onClick={() => onPick(t.title)}>
						{dt ? (
							<ThumbnailStrip thumb={dt.thumb} frames={dt.frames} alt={t.title} />
						) : (
							<div style={thumbBoxStyle}>
								<Text size="xs" c="dimmed" data-picker-na>
									N/A
								</Text>
							</div>
						)}
						<span style={titleStyle}>{t.title}</span>
					</button>
				);
			})}
		</SimpleGrid>
	);
};

interface DocumentPickerModalProps extends DocumentPickerGridProps {
	opened: boolean;
	onClose: () => void;
}

export const DocumentPickerModal: FC<DocumentPickerModalProps> = ({ opened, onClose, ...grid }) => (
	<Modal
		opened={opened}
		onClose={onClose}
		title="保存ドキュメントを開く"
		centered
		size="90vw"
		styles={{ content: { minHeight: "50vh" } }}
		data-doc-picker>
		<DocumentPickerGrid {...grid} />
	</Modal>
);
