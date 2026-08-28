import type { StoredDoc, StoredDocThumbnail } from "@/hooks/useStorage";
import type { DocId } from "@/types/DocId";
import { useSensitiveSessionStore } from "@/state/sensitiveSessionStore";
import { Loader, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import type { CSSProperties, FC } from "react";
import { useEffect, useRef, useState } from "react";

// 保存ドキュメントを「見た目で選ぶ」ビジュアルピッカー (v4 Group D 補間、§0-10 新側内製)。
// FileIOPanel の <Select> を補完する、サムネ + タイトルのギャラリー。
//   - docs: 表示する一覧 (呼び出し側で update 降順ソート済みを渡す)
//   - サムネは docId で個別遅延ロード。未生成は N/A 表示
//   - カードクリックで onPick(docId) (呼び出し側でロード + close)
//   - title は重複しうるので、識別は docId。同名を見分けられるよう更新日時も出す
//   - サムネは横連結1枚画像。通常 1 コマ目、ホバーで順次コマ送り (ThumbnailStrip)
//
// 責務分離 (SlideView/SortableSlideThumb と同方針):
//   - DocumentPickerGrid  = カード描画コア (Modal を知らない = jsdom で素直にテストできる)
//   - DocumentPickerModal = Modal ラッパー (開閉アニメーションあり、薄い配線のみ)

interface DocumentPickerGridProps {
	docs: StoredDoc[];
	/** 1 ドキュメントのサムネを遅延取得する (カードが可視になった時のみ呼ぶ)。未生成は null。 */
	loadThumbnail: (id: DocId) => Promise<StoredDocThumbnail | null>;
	selectedId: DocId | null;
	onPick: (id: DocId) => void;
	/** パスワード欄が空か。true の間はセンシティブ文書カードを選択不可 (デコードを試みない)。 */
	passwordEmpty?: boolean;
}

// ホバーでコマ送りする間隔 (ms)。
const CYCLE_MS = 600;
// カード 1 枚の最小幅 (px)。CSS Grid の minmax(MIN, 1fr) auto-fill でこの値未満に潰さない。
// 狭いコンテナ (スマホ portrait 等) では自動で列数が減り、item はこの幅以上を保つ。
const PICKER_ITEM_MIN_W = 180;

const cardStyle = (selected: boolean, locked: boolean): CSSProperties => ({
	display: "flex",
	flexDirection: "column",
	gap: 4,
	padding: 6,
	border: selected ? "2px solid #228be6" : "1px solid #dee2e6",
	borderRadius: 6,
	background: selected ? "rgba(34,139,230,0.06)" : "#fff",
	cursor: locked ? "not-allowed" : "pointer",
	opacity: locked ? 0.5 : 1,
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
// 更新日時 (title の下)。title は重複しうるため、同名カードを見分ける手掛かりとして添える。
const updatedStyle: CSSProperties = {
	fontSize: 10,
	color: "#868e96",
	whiteSpace: "nowrap",
};

/** 一覧の update (epoch ms) を "YYYY/MM/DD HH:MM" で表示する。 */
const formatUpdated = (update: number): string => {
	if (!update) return "";
	const d = new Date(update);
	const p = (n: number): string => `${n}`.padStart(2, "0");
	return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
// センシティブ文書のサムネ右上に出す 🔒 バッジ (サムネはぼかし済みだが、一目で分かる標示)。
const lockBadgeStyle: CSSProperties = {
	position: "absolute",
	top: 4,
	right: 4,
	width: 22,
	height: 22,
	borderRadius: "50%",
	background: "rgba(0,0,0,0.6)",
	color: "#fff",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	pointerEvents: "none",
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

// カードが表示領域に入った時だけサムネを取得する遅延ロード枠。
//   - idle: 空枠のまま IntersectionObserver で可視化を待つ
//   - loading: スピナーを枠に表示
//   - loaded: ThumbnailStrip を表示 (コマ送り対応)
//   - empty: サムネ未生成 → N/A
// 全件一括ロードをやめ、可視カードぶんだけ IndexedDB を単発 get することでメモリ/デコードを抑える。
// IntersectionObserver 非対応環境 (jsdom テスト等) では即ロードにフォールバックする。
type LoadState = "idle" | "loading" | "loaded" | "empty";
const LazyDocThumbnail: FC<{
	docId: DocId;
	alt: string;
	loadThumbnail: (id: DocId) => Promise<StoredDocThumbnail | null>;
}> = ({ docId, alt, loadThumbnail }) => {
	const [state, setState] = useState<LoadState>("idle");
	const [data, setData] = useState<StoredDocThumbnail | null>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	const startedRef = useRef(false);

	useEffect(() => {
		const el = boxRef.current;
		if (!el) return;
		let cancelled = false;
		const load = (): void => {
			if (startedRef.current) return;
			startedRef.current = true;
			setState("loading");
			loadThumbnail(docId)
				.then((d) => {
					if (cancelled) return;
					setData(d);
					setState(d ? "loaded" : "empty");
				})
				.catch(() => {
					if (!cancelled) setState("empty");
				});
		};
		if (typeof IntersectionObserver === "undefined") {
			load(); // 非対応環境は即ロード
			return;
		}
		const io = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				load();
				io.disconnect();
			}
		});
		io.observe(el);
		return () => {
			cancelled = true;
			io.disconnect();
		};
	}, [docId, loadThumbnail]);

	if (state === "loaded" && data) {
		return <ThumbnailStrip thumb={data.thumb} frames={data.frames} alt={alt} />;
	}
	return (
		<div ref={boxRef} style={thumbBoxStyle} data-picker-thumb-box data-thumb-state={state}>
			{state === "loading" && <Loader size="sm" color="gray" data-picker-thumb-loading />}
			{state === "empty" && (
				<Text size="xs" c="dimmed" data-picker-na>
					N/A
				</Text>
			)}
		</div>
	);
};

export const DocumentPickerGrid: FC<DocumentPickerGridProps> = ({
	docs,
	loadThumbnail,
	selectedId,
	onPick,
	passwordEmpty = false,
}) => {
	if (docs.length === 0) {
		return (
			<Text size="sm" c="dimmed">
				保存済みドキュメントがありません。
			</Text>
		);
	}
	// 列数は viewport ではなくコンテナ幅で決める: minmax(MIN, 1fr) の auto-fill で
	// 幅が狭い時は自動で列数が減り、item が MIN 未満に潰れない。
	// これで狭窓/スマホでもサムネが読める大きさを維持できる (旧: mobile+portrait のみ 1 列固定)。
	const gridStyle: CSSProperties = {
		display: "grid",
		gridTemplateColumns: `repeat(auto-fill, minmax(${PICKER_ITEM_MIN_W}px, 1fr))`,
		gap: 12,
	};
	return (
		<div style={gridStyle}>
			{docs.map((t) => {
				const selected = t.id === selectedId;
				// センシティブ文書は PW 欄が空の間は選択不可 (クリックしてもデコードを試みない)。
				const locked = !!t.isSensitive && passwordEmpty;
				return (
					<button
						type="button"
						key={t.id}
						style={cardStyle(selected, locked)}
						data-picker-item={t.id}
						data-picker-title={t.title}
						data-selected={selected ? "true" : "false"}
						data-picker-locked={locked ? "true" : undefined}
						disabled={locked}
						title={locked ? "パスワードを入力すると開けます" : undefined}
						onClick={locked ? undefined : () => onPick(t.id)}>
						{/* width:100% を明示する理由: 親カードは <button> の flex-column。
						    WebKit (iOS Safari) は button を flex コンテナにすると align-items:stretch
						    を効かせず、この wrapper がクロス軸で content 幅に潰れる。結果 thumbBoxStyle
						    の width:100% が 0 に解決してサムネ枠が消える。明示 100% で button の確定幅に
						    解決させて回避する (desktop Chrome/FF は stretch が効くため元々問題なし)。 */}
						<div style={{ position: "relative", width: "100%" }}>
							<LazyDocThumbnail docId={t.id} alt={t.title} loadThumbnail={loadThumbnail} />
							{t.isSensitive && (
								<div
									style={lockBadgeStyle}
									data-picker-sensitive
									title="センシティブ (パスワード保護)"
									aria-label="センシティブ文書">
									<IconLock size={14} stroke={2.5} />
								</div>
							)}
						</div>
						<span style={titleStyle}>{t.title}</span>
						{/* title は重複しうるので、同名カードを見分ける手掛かりとして更新日時を出す。 */}
						<span style={updatedStyle} data-picker-updated>
							{formatUpdated(t.update)}
						</span>
						{locked && (
							<Text size="xs" c="dimmed" data-picker-locked-hint>
								パスワードを入力してください
							</Text>
						)}
					</button>
				);
			})}
		</div>
	);
};

// センシティブ文書の暗号・復号に使うパスワード入力欄 (最下部にぶち抜きで常設)。
// 値は sensitiveSessionStore に保持 (コンポーネント再マウントでも消えない、リロードで消える)。
// この欄は受動的にパスワードを保持するだけ。暗号/復号は保存・開く操作がこの値を読む。
const SensitivePasswordBox: FC = () => {
	const password = useSensitiveSessionStore((s) => s.password);
	const setPassword = useSensitiveSessionStore((s) => s.setPassword);
	return (
		<PasswordInput
			value={password ?? ""}
			onChange={(e) => setPassword(e.currentTarget.value)}
			label="センシティブ文書のパスワード"
			description="このパスワードで暗号化/復号します。アプリを再読み込みするまで保持されます。"
			placeholder="パスワードを入力"
			size="md"
			styles={{ input: { fontSize: 18 } }}
			data-sensitive-pw-box
		/>
	);
};

interface DocumentPickerModalProps extends DocumentPickerGridProps {
	opened: boolean;
	onClose: () => void;
}

export const DocumentPickerModal: FC<DocumentPickerModalProps> = ({ opened, onClose, ...grid }) => {
	// PW 欄が空ならセンシティブ文書を選択不可にする (store 購読でタイプに追随)。
	const passwordEmpty = useSensitiveSessionStore((s) => !s.password);
	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title="保存ドキュメントを開く"
			centered
			size="90vw"
			styles={{ content: { minHeight: "50vh" } }}
			data-doc-picker>
			<Stack gap="md">
				<DocumentPickerGrid {...grid} passwordEmpty={passwordEmpty} />
				<SensitivePasswordBox />
			</Stack>
		</Modal>
	);
};
