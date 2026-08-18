import { useSlideMutation } from "@/hooks/useSlideMutation";
import { useSlideStore } from "@/state/slideStore";
import { MAX_DURATION, MIN_DURATION } from "@/utils/slideOps";
import { ActionIcon, Checkbox, Group, Switch, Text } from "@mantine/core";
import type { CSSProperties, FC } from "react";

// 閲覧モード (スマホ) 用の「選択スライドの再生設定」調整バー。
//
// スマホは常に VIEW モードで編集 UI が出ないが、スライドショーの見え方だけは手元で
// 直したい (無効化して飛ばす / 表示尺を伸ばす / 前のスライドと結合する) という要求への回答。
// 触れるのはこの 3 種だけで、追加・削除・並び替え・レイヤーには触れない
// (gate 側も EditCapability.SLIDE_PLAYBACK でこの 3 種だけを通す)。
//
// サムネ上の既存コントロールを流用しない理由:
//   サムネは高さ 110px で、有効チェック 25px / 結合矢印 16px / 尺ハンドル 10px という
//   マウス前提の寸法。横持ちスマホ (viewport 高さ 400px 前後) の小さなサムネ上に
//   タップ可能な的を並べると、隣接スライドの誤選択と誤操作が避けられない。
//   選択は一覧のタップで行い、値の変更はこのバーで行う二段構えにする。
//
// 配置は PC (サムネ上のコントロール) の位置関係に合わせる:
//   有効チェック = 左 (PC ではサムネ左下) / 結合 = 右 (PC ではサムネ右) / 表示尺 = 中央。
//   コントロール種別も PC に寄せ、有効は checkbox にする (PC も checkbox)。
//   横持ちスマホは幅も足りないため、有効と結合はラベル無し (aria-label のみ) にする。
//
// 横持ちスマホは viewport の高さが 400px 前後しかないため、バーは可能な限り薄くする:
//   枠 (Paper) を持たず、選択中スライド名も出さない (どれを選んだかは一覧の青枠で分かる)。
//
// 保存は自動で行わない (⋮ メニュー > ドキュメントを保存 の既存導線に任せる)。
// 未保存であることの表示は TopBar 側が持つ。

const barStyle: CSSProperties = {
	flex: "0 0 auto",
	borderTop: "1px solid #dee2e6",
	// バーの高さは実質「操作行の高さ + この padding」。縦を節約するため最小限にする。
	padding: "4px 8px",
};

const stepBtnStyle: CSSProperties = {
	width: 40,
	height: 40,
	fontSize: 18,
	lineHeight: 1,
	// タップ時の青いハイライトと、連続タップでの拡大を抑止する (PasscodeKeypad と同様)。
	WebkitTapHighlightColor: "transparent",
	touchAction: "manipulation",
};

// 左右のトグルを置く枠。中央 (表示尺) を本当の中央に保つため、左右を同じ幅で固定する
// (space-between だと左右の内容幅の差で中央がずれる)。
const SIDE_W = 56;
const sideStyle = (align: "flex-start" | "flex-end"): CSSProperties => ({
	flex: `0 0 ${SIDE_W}px`,
	display: "flex",
	justifyContent: align,
	alignItems: "center",
});

/** 表示尺のラベル。SlideThumbView のバッジと同じ書式 ("x1.5") に揃える。 */
const durationLabel = (ratio: number): string => `x${ratio.toString().substr(0, 3)}`;

export const SlidePlaybackPanel: FC = () => {
	const slides = useSlideStore((s) => s.slides);
	const selectedIndex = useSlideStore((s) => s.selectedIndex);
	const { setSlideDisabled, setSlideJoining, incrementSlideDurationRatio, decrementSlideDurationRatio } =
		useSlideMutation();

	// 文書が無い (スライド 0 件) ときは何も出さない。空のバーで縦を消費しない。
	if (slides.length === 0) return null;

	const slide = slides[selectedIndex];
	// 未選択でもバー自体は出しておく (選択のたびにバーが現れてレイアウトが跳ねるのを避ける)。
	// 操作は無効化する。
	const enabled = !!slide && !slide.disabled;
	const joining = !!slide?.joining;
	const ratio = slide?.durationRatio ?? 1;
	const noSelection = !slide;

	return (
		<div style={barStyle} data-slide-playback-panel>
			<Group align="center" wrap="nowrap" gap="xs">
				{/* 左: 有効/無効 (PC のサムネ左下の checkbox に対応)。無効はスライドショーで飛ばされる。 */}
				<div style={sideStyle("flex-start")}>
					<Checkbox
						checked={enabled}
						disabled={noSelection}
						onChange={() => setSlideDisabled(selectedIndex, enabled)}
						size="lg"
						data-slide-playback-enabled
						aria-label="このスライドを有効にする"
					/>
				</div>

				{/* 中央: 表示尺。段階は slideOps の increment/decrement に任せる
				    (レガシー互換のステップ幅をここで再実装しない)。 */}
				<Group gap={2} align="center" wrap="nowrap" style={{ flex: 1, justifyContent: "center" }}>
					<ActionIcon
						variant="default"
						style={stepBtnStyle}
						disabled={noSelection || ratio <= MIN_DURATION}
						onClick={() => decrementSlideDurationRatio(selectedIndex)}
						data-slide-playback-duration="down"
						aria-label="表示尺を短くする">
						−
					</ActionIcon>
					<Text
						size="sm"
						fw={600}
						ta="center"
						c={noSelection ? "dimmed" : undefined}
						// 桁が変わっても ± ボタンが動かないよう幅を固定する。
						style={{ minWidth: 40, fontVariantNumeric: "tabular-nums" }}
						data-slide-playback-duration-value>
						{durationLabel(ratio)}
					</Text>
					<ActionIcon
						variant="default"
						style={stepBtnStyle}
						disabled={noSelection || ratio >= MAX_DURATION}
						onClick={() => incrementSlideDurationRatio(selectedIndex)}
						data-slide-playback-duration="up"
						aria-label="表示尺を長くする">
						＋
					</ActionIcon>
				</Group>

				{/* 右: 前のスライドとの結合 (PC のサムネ右の ▶/▷ に対応)。 */}
				<div style={sideStyle("flex-end")}>
					<Switch
						checked={joining}
						disabled={noSelection}
						onChange={() => setSlideJoining(selectedIndex, !joining)}
						size="md"
						data-slide-playback-joining
						aria-label="次のスライドと結合する"
					/>
				</div>
			</Group>
		</div>
	);
};
