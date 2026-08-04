import type { CSSProperties, FC } from "react";
import { useEffect, useRef } from "react";

// パスコード入力用の 10 キー (iOS のロック画面風)。docs/app-lock-spec.md §7.4。
//
// TextField を使わない理由:
//   - iOS でソフトキーボードが立ち上がると、ロック画面の下半分が隠れて解錠ボタンに届かなくなる
//   - キーボードの出入りで 100dvh が揺れ、オーバーレイのレイアウトが動く
//   - 数字だけ受け付けたいのに、予測変換やペーストで想定外の文字が入り得る
// 自前のキーパッドなら入力経路が数字 10 個 + 削除に限定され、レイアウトも固定できる。
//
// パスコードは 4〜32 桁の可変長 (既に保存されている検証子との互換のため長さを変えられない)。
// 呼び出し側が正解の桁数 (expectedLength) を知っていれば、そこに到達した時点で自動照合できる
// (iOS の「N 桁目で自動送信」と同じ)。桁数が分からない場合は明示的な送信ボタンを置く。
// ドットは expectedLength (無ければ minLength) を下限に、それを超えた入力ぶんだけ増える。

// 押下フィードバックとキーサイズ。JS のタイマを使わず CSS だけで完結させる
// (SlideshowShell の SS_HOVER_CSS / ToastHost の TOAST_ANIM_CSS と同じ手法)。
//
// キーサイズを CSS 変数にしているのは縦の余白対策: manifest が orientation:landscape なので
// スマホでは viewport の高さが 400px 前後しかなく、68px キー (4 行 = 314px) だとタイトルや
// 解錠ボタンが画面外へ押し出される。高さに応じて縮める。
const KEYPAD_CSS = `
[data-passcode-keypad]{--pk-key:68px;--pk-gap:14px;--pk-font:26px}
@media (max-height:560px){[data-passcode-keypad]{--pk-key:52px;--pk-gap:10px;--pk-font:20px}}
@media (max-height:440px){[data-passcode-keypad]{--pk-key:42px;--pk-gap:8px;--pk-font:17px}}
[data-passcode-tone="dark"]{--pk-fg:#fff;--pk-bg:rgba(255,255,255,.14);--pk-bg-active:rgba(255,255,255,.28);--pk-dot-bd:rgba(255,255,255,.45)}
[data-passcode-tone="light"]{--pk-fg:#212529;--pk-bg:rgba(0,0,0,.06);--pk-bg-active:rgba(0,0,0,.15);--pk-dot-bd:rgba(0,0,0,.3)}
[data-passcode-key]{width:var(--pk-key);height:var(--pk-key);line-height:var(--pk-key);font-size:var(--pk-font);color:var(--pk-fg);background:var(--pk-bg);transition:background-color .12s ease,transform .06s ease}
[data-passcode-key="delete"]{background:transparent}
[data-passcode-key]:active:not(:disabled){background-color:var(--pk-bg-active);transform:scale(.94)}
[data-passcode-key]:disabled{opacity:.35}
[data-passcode-grid]{grid-template-columns:repeat(3,var(--pk-key));gap:var(--pk-gap)}
[data-passcode-dot]{width:12px;height:12px;border-radius:50%;box-sizing:border-box}
[data-passcode-dot="filled"]{background:var(--pk-fg)}
[data-passcode-dot="empty"]{background:transparent;border:1.5px solid var(--pk-dot-bd)}
`;

/** キーパッドの配色。暗いオーバーレイ (ロック画面) と明るいモーダル (設定) の両方で使う。 */
export const PasscodeKeypadTone = {
	DARK: "dark",
	LIGHT: "light",
} as const;
export type PasscodeKeypadTone = (typeof PasscodeKeypadTone)[keyof typeof PasscodeKeypadTone];

const gridStyle: CSSProperties = {
	display: "grid",
	justifyContent: "center",
};

// 寸法・フォントサイズ・配色は KEYPAD_CSS 側 ([data-passcode-key]) で持つ。
const keyStyle: CSSProperties = {
	borderRadius: "50%",
	border: "none",
	fontFamily: "inherit",
	padding: 0,
	cursor: "pointer",
	// タップ時の青いハイライトと、連続タップでの拡大を抑止する。
	WebkitTapHighlightColor: "transparent",
	touchAction: "manipulation",
	userSelect: "none",
};

const dotsRowStyle: CSSProperties = {
	display: "flex",
	gap: 12,
	justifyContent: "center",
	alignItems: "center",
	// 入力が伸びても行の高さが変わらないようにする。
	minHeight: 16,
	flexWrap: "wrap",
};

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

interface PasscodeKeypadProps {
	value: string;
	onChange: (next: string) => void;
	/** 送信 (物理キーボードの Enter から呼ばれる)。ボタンは呼び出し側が置く。 */
	onSubmit: () => void;
	/** 入力を受け付けない (処理中 / クールダウン中)。 */
	disabled?: boolean;
	/** ドット表示の下限個数。 */
	minLength: number;
	/** これ以上は入力できない。 */
	maxLength: number;
	/**
	 * 正解の桁数が分かっている場合の期待桁数。ドットの既定個数になる。
	 * 呼び出し側は「この桁数に達したら自動で照合する」ために使う。
	 *
	 * ここで入力を打ち止めはしない: 保存された桁数が実際のパスコードと食い違った場合に、
	 * 残りの桁を打てず解錠不能になるため。桁数不明のときは undefined。
	 */
	expectedLength?: number;
	/** 配色。暗いオーバーレイ上か明るいモーダル上かで切り替える。 */
	tone?: PasscodeKeypadTone;
}

export const PasscodeKeypad: FC<PasscodeKeypadProps> = ({
	value,
	onChange,
	onSubmit,
	disabled = false,
	minLength,
	maxLength,
	expectedLength,
	tone = PasscodeKeypadTone.DARK,
}) => {
	// value を直接読まずに ref 経由で積む。連続入力 (高速タイプ、素早い連続タップ) は同一の
	// React バッチにまとまるため、value を閉じ込めると 2 回目以降が古い値を見て桁が落ちる。
	// 楽観的に ref を進めておき、再レンダーごとに親の値へ同期し直す。
	const valueRef = useRef(value);
	valueRef.current = value;

	// expectedLength では打ち止めない。保存された桁数が実際のパスコードと食い違った場合に
	// 残りの桁を打てず解錠不能になる (自分で作った罠を塞ぐ)。上限は maxLength だけ。
	const cap = maxLength;

	const push = (d: string): void => {
		const cur = valueRef.current;
		if (disabled || cur.length >= cap) return;
		const next = cur + d;
		valueRef.current = next;
		onChange(next);
	};
	const pop = (): void => {
		const cur = valueRef.current;
		if (disabled || cur.length === 0) return;
		const next = cur.slice(0, -1);
		valueRef.current = next;
		onChange(next);
	};

	// 物理キーボードからの入力も受ける。PC (幅 900px 以下) でもロック画面が出るため、
	// キーパッドしか無いと検証や PC 利用時にマウスで 1 桁ずつ押すことになる。
	// 判定は e.key (ユーザーは Mac JIS 配列。e.code の物理位置では合わない)。
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent): void => {
			if (disabled) return;
			if (e.key >= "0" && e.key <= "9") {
				e.preventDefault();
				push(e.key);
				return;
			}
			if (e.key === "Backspace") {
				e.preventDefault();
				pop();
				return;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				onSubmit();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	});

	// 期待桁数が分かればその数だけドットを出す (iOS と同じ「残り何桁か見える」挙動)。
	// 超過入力があればその分だけ伸ばす (上記のとおり打ち止めないため)。
	const dotCount = Math.max(expectedLength ?? minLength, value.length);

	return (
		<div data-passcode-keypad data-passcode-tone={tone}>
			<style>{KEYPAD_CSS}</style>
			{/* 入力桁数の表示。値そのものは一切見せない。 */}
			<div
				style={dotsRowStyle}
				data-passcode-dots
				data-passcode-length={value.length}
				role="status"
				aria-label={`パスコード ${value.length} 桁入力済み`}>
				{Array.from({ length: dotCount }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: 位置そのものが識別子 (並び替えなし)
					<span key={i} data-passcode-dot={i < value.length ? "filled" : "empty"} />
				))}
			</div>
			<div style={{ height: 16 }} />
			<div style={gridStyle} data-passcode-grid role="group" aria-label="パスコード入力">
				{DIGITS.map((d) => (
					<button
						key={d}
						type="button"
						style={keyStyle}
						disabled={disabled || value.length >= cap}
						onClick={() => push(d)}
						data-passcode-key={d}
						aria-label={d}>
						{d}
					</button>
				))}
				{/* 左下は空 (iOS の配置に合わせ、0 を中央に置く)。 */}
				<span />
				<button
					type="button"
					style={keyStyle}
					disabled={disabled || value.length >= cap}
					onClick={() => push("0")}
					data-passcode-key="0"
					aria-label="0">
					0
				</button>
				<button
					type="button"
					style={keyStyle}
					disabled={disabled || value.length === 0}
					onClick={pop}
					data-passcode-key="delete"
					aria-label="1 文字削除">
					⌫
				</button>
			</div>
		</div>
	);
};
