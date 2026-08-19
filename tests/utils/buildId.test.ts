import { describe, expect, it } from "vitest";
import { BUILD_ID } from "../../src/utils/buildId";

// BUILD_ID: ビルド時刻 + コミットハッシュ。実機で「今動いているのが最新の版か」を
// 判断するために ⋮ メニューへ出す。値は vite.config.js の define で埋め込まれる。
//
// vitest には define が無いので、ここで確認できるのは「未定義でも落ちずに
// fallback する」ことだけ。ここが throw すると ⋮ メニュー全体が壊れる。

describe("BUILD_ID", () => {
	it("define が無い環境 (vitest) でも throw せず文字列を返す", () => {
		expect(typeof BUILD_ID).toBe("string");
		expect(BUILD_ID.length).toBeGreaterThan(0);
	});

	it("define が無い環境では 'dev' になる", () => {
		expect(BUILD_ID).toBe("dev");
	});
});
