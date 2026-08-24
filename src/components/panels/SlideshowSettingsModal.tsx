import { useDeviceMode } from "@/hooks/useDeviceMode";
import {
	resolveTweenTiming,
	selectSlideshowSettings,
	SLIDESHOW_SETTINGS_DEFAULT,
	type SlideshowSettings,
	type TweenEase,
	TWEEN_OFFSET_TOTAL_MAX_PERCENT,
	useSlideshowStore,
} from "@/state/slideshowStore";
import { ActionIcon, Button, Group, Modal, Slider, Stack, Switch, Text } from "@mantine/core";
import { IconRestore } from "@tabler/icons-react";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { TweenCurveEditor } from "./slideshow/TweenCurveEditor";

// legacy (index.html) の select 選択肢を参考にした範囲:
// - interval: 500..15000 (legacy 選択肢は 500, 1000, 2000..15000。全て step=500 で網羅可能)
// - duration: 0..5000 (legacy 選択肢は 1(=表示"0"), 500, 1000, 2000..5000)
const INTERVAL_MIN = 500;
const INTERVAL_MAX = 15000;
const INTERVAL_STEP = 500;
const DURATION_MIN = 0;
const DURATION_MAX = 5000;
const DURATION_STEP = 500;

// スライドショー設定モーダル (§9)。SlideShowOpsPanel に散在していた設定 UI
// (interval / duration / 結合トランジション / flipX / flipY / 全画面で開始) を集約する。
//
// 編集は「下書き」方式:
//   - 開いた時点の設定を draft に複製し、以降の操作は draft だけを書き換える
//   - OK 押下でのみ store へ反映 + localStorage へ保存
//   - バックドロップ / Esc で閉じた場合は draft を捨てる = 設定もアニメーションも変わらない
// 触っただけで再生中のアニメーションが変わってしまうのを避けるため、この形にしてある。

interface SlideshowSettingsModalProps {
	opened: boolean;
	onClose: () => void;
}

// 前後オフセットは合計に上限があるので、片方を動かすときはもう片方を見てクランプする。
const clampOffset = (v: number, otherSide: number): number =>
	Math.min(TWEEN_OFFSET_TOTAL_MAX_PERCENT - otherSide, Math.max(0, Math.round(v)));

const sameEase = (a: TweenEase, b: TweenEase): boolean =>
	a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;

export const SlideshowSettingsModal: FC<SlideshowSettingsModalProps> = ({ opened, onClose }) => {
	const applySettings = useSlideshowStore((s) => s.applySettings);
	const [draft, setDraft] = useState<SlideshowSettings>(selectSlideshowSettings);
	// 開くたびに現在値から下書きを作り直す (前回キャンセルした編集を持ち越さない)。
	useEffect(() => {
		if (opened) setDraft(selectSlideshowSettings());
	}, [opened]);

	// mobile では Fullscreen API が事実上使えない (iOS Safari 非対応 + PWA は既に全画面) ため
	// トグルを隠す。設定値自体は残す (mobile→PC で復帰した時に戻る)。
	const { isMobile } = useDeviceMode();

	const patch = (p: Partial<SlideshowSettings>): void => setDraft((d) => ({ ...d, ...p }));
	const setPre = (v: number): void =>
		setDraft((d) => ({ ...d, tweenPrePercent: clampOffset(v, d.tweenPostPercent) }));
	const setPost = (v: number): void =>
		setDraft((d) => ({ ...d, tweenPostPercent: clampOffset(v, d.tweenPrePercent) }));

	const handleOk = (): void => {
		applySettings(draft);
		onClose();
	};

	const d = SLIDESHOW_SETTINGS_DEFAULT;
	const tweenIsDefault =
		draft.tweenPrePercent === d.tweenPrePercent &&
		draft.tweenPostPercent === d.tweenPostPercent &&
		sameEase(draft.tweenEase, d.tweenEase);
	const allIsDefault =
		tweenIsDefault &&
		draft.intervalMs === d.intervalMs &&
		draft.durationMs === d.durationMs &&
		draft.flipX === d.flipX &&
		draft.flipY === d.flipY &&
		draft.startFullscreen === d.startFullscreen;

	// durationRatio=1 のスライドを基準にした実時間の目安 (設定の効きを数値で見せる)。
	const tweenPreview = resolveTweenTiming(
		draft.intervalMs,
		draft.tweenPrePercent,
		draft.tweenPostPercent
	);

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title="スライドショー設定"
			centered
			data-slideshow-settings>
			<Stack gap="md">
				<div data-ss-op="interval">
					<Group gap={4} align="center" mb={4}>
						<Text size="sm">間隔 interval: {draft.intervalMs} ms</Text>
						<ActionIcon
							variant="subtle"
							size="sm"
							onClick={() => patch({ intervalMs: d.intervalMs })}
							disabled={draft.intervalMs === d.intervalMs}
							aria-label="間隔を既定値に戻す"
							data-ss-op="interval-reset">
							<IconRestore size={14} />
						</ActionIcon>
					</Group>
					<Slider
						value={draft.intervalMs}
						onChange={(v) => patch({ intervalMs: v })}
						min={INTERVAL_MIN}
						max={INTERVAL_MAX}
						step={INTERVAL_STEP}
						label={(v) => `${v} ms`}
						size="sm"
					/>
				</div>
				<div data-ss-op="duration">
					<Group gap={4} align="center" mb={4}>
						<Text size="sm">フェード duration: {draft.durationMs} ms</Text>
						<ActionIcon
							variant="subtle"
							size="sm"
							onClick={() => patch({ durationMs: d.durationMs })}
							disabled={draft.durationMs === d.durationMs}
							aria-label="フェードを既定値に戻す"
							data-ss-op="duration-reset">
							<IconRestore size={14} />
						</ActionIcon>
					</Group>
					<Slider
						value={draft.durationMs}
						onChange={(v) => patch({ durationMs: v })}
						min={DURATION_MIN}
						max={DURATION_MAX}
						step={DURATION_STEP}
						label={(v) => `${v} ms`}
						size="sm"
					/>
				</div>
				{/* 結合スライド (joining + 同一構造) の tween。起点/終点と曲線を 1 つの図で扱う。 */}
				<div data-ss-op="tween-offset">
					<Group gap={4} align="center" mb={4}>
						<Text size="sm">結合トランジション</Text>
						<ActionIcon
							variant="subtle"
							size="sm"
							onClick={() =>
								patch({
									tweenPrePercent: d.tweenPrePercent,
									tweenPostPercent: d.tweenPostPercent,
									tweenEase: d.tweenEase,
								})
							}
							disabled={tweenIsDefault}
							aria-label="結合トランジションを既定値に戻す"
							data-ss-op="tween-reset">
							<IconRestore size={14} />
						</ActionIcon>
					</Group>
					<Text size="xs" c="dimmed" mb={4}>
						縦の帯が起点/終点 (前後の静止)、丸が曲線の制御点。どちらも左右にドラッグできる。
					</Text>
					<TweenCurveEditor
						prePercent={draft.tweenPrePercent}
						postPercent={draft.tweenPostPercent}
						ease={draft.tweenEase}
						onChangePre={setPre}
						onChangePost={setPost}
						onChangeEase={(tweenEase) => patch({ tweenEase })}
					/>
					<Text size="xs" c="dimmed" mt={4} data-ss-op="tween-offset-preview">
						表示 {draft.intervalMs} ms のとき — 前 {Math.round(tweenPreview.delayMs)} ms / 動き{" "}
						{Math.round(tweenPreview.animMs)} ms / 後{" "}
						{Math.round(draft.intervalMs - tweenPreview.delayMs - tweenPreview.animMs)} ms
					</Text>
				</div>
				<Group gap="md">
					<div data-ss-op="flip-x">
						<Switch
							label="左右反転 (flipX)"
							checked={draft.flipX}
							onChange={(e) => patch({ flipX: e.currentTarget.checked })}
							size="sm"
						/>
					</div>
					<div data-ss-op="flip-y">
						<Switch
							label="上下反転 (flipY)"
							checked={draft.flipY}
							onChange={(e) => patch({ flipY: e.currentTarget.checked })}
							size="sm"
						/>
					</div>
				</Group>
				{!isMobile && (
					<div data-ss-op="fullscreen">
						<Switch
							label="全画面で開始"
							checked={draft.startFullscreen}
							onChange={(e) => patch({ startFullscreen: e.currentTarget.checked })}
							size="sm"
						/>
					</div>
				)}
				<Group justify="space-between" mt="sm">
					{/* リセットも下書きに対する操作。確定はあくまで OK。 */}
					<Button
						variant="default"
						onClick={() => setDraft(SLIDESHOW_SETTINGS_DEFAULT)}
						disabled={allIsDefault}
						data-ss-op="reset-all">
						リセット
					</Button>
					<Button onClick={handleOk} data-ss-op="ok">
						OK
					</Button>
				</Group>
			</Stack>
		</Modal>
	);
};
