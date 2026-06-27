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
// サムネ表示枠の固定高さ。コマはこの枠内に contain (アスペクト保持・レターボックス) で収める。
const THUMB_BOX_H = 160;
// サムネ表示枠 (固定サイズ)。N/A も同枠で揃える。中身 (コマ) は中央 contain。
const thumbBoxStyle: CSSProperties = {
	width: "100%",
	height: THUMB_BOX_H,
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
// コマは枠を cover (アスペクト保持で枠を埋め、はみ出しはクロップ) する:
//   - 連結画像の自然寸法から 1 コマのアスペクト (naturalWidth/frames : naturalHeight) を取得。
//   - 枠の実幅を ResizeObserver で計測し、固定高さ THUMB_BOX_H と合わせて cover 表示寸法を算出。
//   - その寸法でスプライト (背景) を配置し、background-position(px) でコマ送り。枠 overflow:hidden でクロップ。
const ThumbnailStrip: FC<{ thumb: string; frames: number; alt: string }> = ({
	thumb,
	frames,
	alt,
}) => {
	const [frame, setFrame] = useState(0);
	const [aspect, setAspect] = useState(0); // 1 コマの fw/fh (0=未取得)
	const [boxW, setBoxW] = useState(0);
	const boxRef = useRef<HTMLDivElement>(null);
	const timerRef = useRef<number | null>(null);

	// サムネ差し替え時は先頭コマへ。
	useEffect(() => setFrame(0), [thumb]);
	// アンマウント時に timer を必ず止める。
	useEffect(() => () => stop(), []);
	// 連結画像の自然寸法 → 1 コマのアスペクト。
	useEffect(() => {
		let cancelled = false;
		const img = new Image();
		img.onload = () => {
			if (!cancelled && img.naturalHeight > 0) {
				setAspect(img.naturalWidth / frames / img.naturalHeight);
			}
		};
		img.src = thumb;
		return () => {
			cancelled = true;
		};
	}, [thumb, frames]);
	// 枠の実幅を計測 (contain 計算用)。
	useEffect(() => {
		const el = boxRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => setBoxW(entries[0].contentRect.width));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

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

	// cover: アスペクト保持で枠を埋め、はみ出しは枠の overflow:hidden + 中央寄せでクロップ。
	let spriteStyle: CSSProperties = { display: "none" };
	if (aspect > 0 && boxW > 0) {
		const dispH = Math.max(THUMB_BOX_H, boxW / aspect);
		const dispW = dispH * aspect;
		spriteStyle = {
			width: dispW,
			height: dispH,
			// flex 子は既定で縮小 (flex-shrink:1) され box 幅に詰められて左寄せクロップになる。
			// flexShrink:0 で dispW を維持し、親の justify/align center + overflow:hidden で中央クロップにする。
			flexShrink: 0,
			backgroundImage: `url(${thumb})`,
			backgroundRepeat: "no-repeat",
			backgroundSize: `${dispW * frames}px ${dispH}px`,
			backgroundPosition: `${-frame * dispW}px 0`,
		};
	}
	return (
		<div
			ref={boxRef}
			style={thumbBoxStyle}
			onMouseOver={start}
			onMouseOut={reset}
			data-picker-thumb
			data-thumb-frames={frames}
			data-thumb-frame={frame}
			aria-label={alt}>
			<div style={spriteStyle} data-thumb-sprite />
		</div>
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
