import { useViewerDocumentStore } from "@/state/viewerDocumentStore";
import { type CSSProperties, useEffect, useRef, useState } from "react";

// 画面上端に固定表示するグローバル進捗バー (AppShell に 1 つマウント)。
// レガシー (src/view/ProgressBar.ts + .progress CSS) の見た目を再現:
//   - 高さ 3px の細いバーが左→右へ width で伸びる (width transition 0.1s)
//   - 紫→赤→橙の 3 色グラデーション / 文字・数字なし
//   - 完了時は fadeOut (~1s) で消える
// 消えるのは次の 2 つの時だけ:
//   - progress >= 1 に達した時 = 正常完了 → 100% まで伸ばし切ってから fadeOut。
//   - progress === null = 明示的 Abort (キャンセル/エラー) → 即座に消す。
// 進行中 (0..<1) の途中値では決して消えない。
// モーダル (~200) / スライドショー (9999) / トースト (100000) より上に出す。
const Z_INDEX = 100001;
/** 進捗バーの高さ (px)。AppShell が同じ分だけ上パディングを確保しコンテンツと重ならないようにする。 */
export const PROGRESS_BAR_HEIGHT = 3;
const HOLD_MS = 120; // 100% 到達を見せる保持
const FADE_MS = 900; // fadeOut 時間 (レガシー 1s 相当)
// レガシー .progress のグラデーション (紫→赤→橙)。
const LEGACY_GRADIENT =
	"linear-gradient(90deg, rgba(131,58,180,1) 0%, rgba(253,29,29,1) 50%, rgba(252,176,69,1) 100%)";

export const ProgressBar = () => {
	const progress = useViewerDocumentStore((s) => s.progress);
	const label = useViewerDocumentStore((s) => s.progressLabel);
	const [visible, setVisible] = useState(false);
	const [fading, setFading] = useState(false);
	const [width, setWidth] = useState(0);
	const activeRef = useRef(false); // 直前まで進行中だったか (完了アニメを出すか判定)

	useEffect(() => {
		if (progress === null) {
			// 明示的 Abort → 完了アニメを出さず即消し。
			activeRef.current = false;
			setVisible(false);
			setFading(false);
			setWidth(0);
			return;
		}
		if (progress >= 1) {
			// 正常完了。進行中だった時だけ 100% まで伸ばし切ってから fadeOut。
			if (!activeRef.current) return; // 進行中でなければ無視 (フラッシュ防止)
			activeRef.current = false;
			setWidth(100);
			const t1 = window.setTimeout(() => setFading(true), HOLD_MS);
			const t2 = window.setTimeout(() => {
				setVisible(false);
				setFading(false);
				setWidth(0);
			}, HOLD_MS + FADE_MS);
			return () => {
				window.clearTimeout(t1);
				window.clearTimeout(t2);
			};
		}
		// 進行中 (0..<1)。
		activeRef.current = true;
		setVisible(true);
		setFading(false);
		setWidth(Math.max(4, Math.round(progress * 100))); // 開始直後も見えるよう最低 4%
	}, [progress]);

	if (!visible) return null;
	const barStyle: CSSProperties = {
		position: "fixed",
		top: 0,
		left: 0,
		height: PROGRESS_BAR_HEIGHT,
		width: `${width}vw`,
		zIndex: Z_INDEX,
		background: LEGACY_GRADIENT,
		transitionProperty: "width, opacity",
		transitionDuration: fading ? `0.1s, ${FADE_MS}ms` : "0.1s, 0s",
		transitionTimingFunction: "linear, ease",
		opacity: fading ? 0 : 1,
		pointerEvents: "none", // 操作を妨げない
	};
	return <div style={barStyle} data-progress-bar data-progress-fill aria-label={label} aria-live="polite" />;
};
