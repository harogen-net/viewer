import type { CSSProperties, FC, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

// 数値調整入力 (v4 Group D D-10、function-list §12、§0-10 新側内製)。
// レガシー src/viewModel/VMUI.ts の VMVariableInput / VMHistoricalVariableInput を
// 制御コンポーネントとして再実装。jQuery / EventDispatcher は使わない。
//
// 値調整 (§12「入力欄での値調整」):
//   - Enter      : 入力文字列を parse して反映 (Enter 反映)
//   - ↑ / ↓      : step 増減。multiply=true は ↑ ×(1+step) / ↓ ÷(1+step) (legacy parity)
//   - ホイール    : フォーカス中のみ増減 (上スクロール=増、legacy `-sign(deltaY)*v`)
//   - Shift 押下  : shiftStep 指定の入力のみ ↑↓/ホイールの増減量を shiftStep に切替 (粗調整、位置用)
//   - min / max  : clamp (restrictValue 相当)
//   - 表示は小数 2 桁で floor (legacy `Math.floor(v*100)/100`)
//
// history 連携 (legacy VMHistoricalVariableInput):
//   - onAdjust         : 値変化のたびに即時反映 (live、history は積まない)
//   - onAdjustStart    : focus 時 (呼び元が before snapshot を取得)
//   - onAdjustEnd      : blur 時 (呼び元が変化あれば history 1 件記録)
//   フォーカス→ブラー 1 セッションで undo 1 ステップ。
//
// ホイールは React onWheel が passive で preventDefault が効かないため
// native listener を non-passive で張る (SlideEditView と同方針)。

interface NumberAdjustInputProps {
	value: number;
	step: number;
	/** true で ×(1±step) の乗算モード (scale 用)。false で加減算。 */
	multiply?: boolean;
	min?: number;
	max?: number;
	/** 指定すると Shift 押下時の増減量をこの値に切替 (粗調整、位置入力用)。未指定なら Shift 無効。 */
	shiftStep?: number;
	/** true で ↑↓/ホイールの増減方向を反転 (legacy 位置入力の負 step `v:-25` 相当)。 */
	invert?: boolean;
	disabled?: boolean;
	/** data-adjust 属性 (テスト/識別用)。 */
	dataAdjust?: string;
	"aria-label"?: string;
	/** 値変化のたびに呼ばれる (live 反映)。 */
	onAdjust: (next: number) => void;
	/** focus 時 (history before 取得)。 */
	onAdjustStart?: () => void;
	/** blur 時 (history 記録)。 */
	onAdjustEnd?: () => void;
}

const format = (v: number): string => String(Math.floor(v * 100) / 100);

const inputStyle: CSSProperties = {
	width: 64,
	padding: "2px 6px",
	border: "1px solid #ced4da",
	borderRadius: 4,
	fontSize: 12,
	fontFamily: "monospace",
	textAlign: "right",
};

export const NumberAdjustInput: FC<NumberAdjustInputProps> = ({
	value,
	step,
	multiply = false,
	min,
	max,
	shiftStep,
	invert = false,
	disabled = false,
	dataAdjust,
	"aria-label": ariaLabel,
	onAdjust,
	onAdjustStart,
	onAdjustEnd,
}) => {
	const [draft, setDraft] = useState<string>(() => format(value));
	const focusedRef = useRef(false);
	const elRef = useRef<HTMLInputElement>(null);

	// 外部 (store) からの value 変化はフォーカス外のときだけ draft に同期
	// (入力中にカーソル/未確定文字を奪わない)。
	useEffect(() => {
		if (!focusedRef.current) setDraft(format(value));
	}, [value]);

	const clamp = (v: number): number => {
		let r = v;
		if (min !== undefined && r < min) r = min;
		if (max !== undefined && r > max) r = max;
		return r;
	};

	const commit = (raw: number): void => {
		if (!Number.isFinite(raw)) return;
		const next = clamp(raw);
		onAdjust(next);
		setDraft(format(next));
	};

	// shift=true かつ shiftStep 指定で増減量を shiftStep に切替 (粗調整、位置入力用)。
	// multiply モードは legacy 準拠で ↑ ×(1+s) / ↓ ÷(1+s) (= ×0.9 ではなく ÷1.1)。
	const adjust = (dir: 1 | -1, shift = false): void => {
		const s = shift && shiftStep !== undefined ? shiftStep : step;
		const d = invert ? -dir : dir; // legacy 位置入力は ↑ で減少 (v:-25)
		let next: number;
		if (multiply) {
			next = d === 1 ? value * (1 + s) : value / (1 + s);
		} else {
			next = value + d * s;
		}
		commit(next);
	};

	// ホイール (フォーカス中のみ、上スクロール=増)。native non-passive。
	useEffect(() => {
		const el = elRef.current;
		if (!el) return;
		const handler = (e: WheelEvent): void => {
			if (!focusedRef.current || disabled || e.deltaY === 0) return;
			e.preventDefault();
			adjust(e.deltaY < 0 ? 1 : -1, e.shiftKey);
		};
		el.addEventListener("wheel", handler, { passive: false });
		return () => el.removeEventListener("wheel", handler);
		// adjust は value/step/multiply/shiftStep/invert に依存。再登録で最新を参照。
	}, [value, step, multiply, disabled, shiftStep, invert]);

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
		if (e.key === "Enter") {
			commit(Number.parseFloat(draft));
			e.currentTarget.select();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			adjust(1, e.shiftKey);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			adjust(-1, e.shiftKey);
		}
	};

	return (
		<input
			ref={elRef}
			type="text"
			inputMode="decimal"
			value={draft}
			disabled={disabled}
			style={inputStyle}
			data-adjust={dataAdjust}
			aria-label={ariaLabel}
			onChange={(e) => setDraft(e.currentTarget.value)}
			onKeyDown={handleKeyDown}
			onFocus={(e) => {
				focusedRef.current = true;
				onAdjustStart?.();
				e.currentTarget.select();
			}}
			onBlur={() => {
				focusedRef.current = false;
				commit(Number.parseFloat(draft));
				onAdjustEnd?.();
			}}
		/>
	);
};
