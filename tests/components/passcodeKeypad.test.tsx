import { MantineProvider } from "@mantine/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppLockScreen } from "../../src/components/AppLockScreen";
import { PasscodeKeypad } from "../../src/components/common/PasscodeKeypad";

// キーパッドの寸法と、ロック画面上での配置。
//
// 個々の px 値そのものは検証しない (値を書き換えるたびにテストも直すことになり、regression を
// 何も守らない)。守りたいのは「押せる大きさを下回らない」という不変条件で、これは実際に一度
// 破っている: viewport の縦が狭い端末向けの段が 42px まで縮んでいて、実機で押しにくかった。
// 段を追加・縮小するときにこのテストが止める。

/** キーパッドが宣言する各段の --pk-key を、CSS 内の出現順 (広い viewport → 狭い) で返す。 */
const readKeySizes = (container: HTMLElement): number[] => {
	const css = container.querySelector("style")?.textContent ?? "";
	return [...css.matchAll(/--pk-key:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("PasscodeKeypad の寸法", () => {
	const renderKeypad = (): void => {
		act(() => {
			root.render(
				<PasscodeKeypad
					value=""
					onChange={() => {}}
					onSubmit={() => {}}
					minLength={4}
					maxLength={32}
				/>
			);
		});
	};

	// タップ精度の推奨下限 (iOS HIG 44pt / Material 48dp)。どの段もこれを割ってはいけない。
	const MIN_TAP_TARGET_PX = 44;

	it("すべての段のキー径がタップ領域の下限を満たす", () => {
		renderKeypad();
		const sizes = readKeySizes(container);
		// 段が消えていないことも同時に見る (メディアクエリごと削られたら 1 件になる)。
		expect(sizes.length).toBeGreaterThanOrEqual(3);
		for (const size of sizes) {
			expect(size).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
		}
	});

	it("viewport が狭い段ほどキーが小さい (段の順序が崩れていない)", () => {
		renderKeypad();
		const sizes = readKeySizes(container);
		for (let i = 1; i < sizes.length; i++) {
			expect(sizes[i]).toBeLessThan(sizes[i - 1]);
		}
	});

	it("3x4 グリッドの押せるキーは 0-9 と削除の 11 個", () => {
		renderKeypad();
		// NodeList のスプレッドは tsconfig の lib に DOM.Iterable が無いと型エラーになる。
		const keys = Array.from(container.querySelectorAll("[data-passcode-key]"), (el) =>
			el.getAttribute("data-passcode-key")
		);
		expect(keys.sort()).toEqual(
			["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "delete"].sort()
		);
	});
});

describe("AppLockScreen のキーパッド配置", () => {
	// 中央寄せだとキーパッドが画面上半分に食い込み、端末を持った手の親指が届かない。
	// 下寄せに戻す変更を検知する。
	it("パネルを縦中央ではなく下寄せで配置する", () => {
		act(() => {
			root.render(
				<MantineProvider>
					<AppLockScreen />
				</MantineProvider>
			);
		});
		const wrap = container.querySelector<HTMLElement>("[data-app-lock] > div");
		expect(wrap).not.toBeNull();
		expect(wrap?.style.alignItems).toBe("flex-end");
		// 下端に貼り付くと誤タップとホームインジケータに当たるので必ず浮かせる。
		expect(wrap?.style.paddingBottom).not.toBe("");
	});
});
