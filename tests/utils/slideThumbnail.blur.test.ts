import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Slide } from "../../src/types/Slide";
import type { ViewerDocument } from "../../src/types/ViewerDocument";
import { generateSlideThumbnailDataURL } from "../../src/utils/slideThumbnail";

// Phase 5: センシティブ文書サムネのぼかし。jsdom は canvas 描画をしないため、
// ctx.filter に blur(...) が設定される「制御」を stub context で検証する
// (実ピクセルのぼけ具合は視覚確認の領域)。

let origGetContext: typeof HTMLCanvasElement.prototype.getContext;
let origToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;
let filterLog: string[];

const makeCtx = (log: string[]) => {
	let filter = "none";
	return {
		fillStyle: "",
		globalAlpha: 1,
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "high",
		get filter() {
			return filter;
		},
		set filter(v: string) {
			filter = v;
			log.push(v);
		},
		fillRect: () => {},
		clearRect: () => {},
		scale: () => {},
		translate: () => {},
		rotate: () => {},
		drawImage: () => {},
		resetTransform: () => {},
	};
};

const imageSlide = (): Slide => ({
	id: 1,
	uuid: "s1",
	width: 800,
	height: 600,
	durationRatio: 1,
	joining: true,
	disabled: false,
	layers: [
		{
			id: 1,
			uuid: "l1",
			name: "",
			opacity: 1,
			locked: false,
			visible: true,
			shared: false,
			transX: 0,
			transY: 0,
			scaleX: 1,
			scaleY: 1,
			rotation: 0,
			mirrorH: false,
			mirrorV: false,
			type: "image",
			imageId: "img1",
			clipRect: [0, 0, 0, 0],
			isText: false,
		},
	],
});

const doc = (): ViewerDocument => ({
	title: "t",
	width: 800,
	height: 600,
	createTime: 0,
	editTime: 0,
	bgColor: "#ffffff",
	slides: [imageSlide()],
});
const imageMap = { img1: "data:image/png;base64,AAAA" };

beforeEach(() => {
	filterLog = [];
	origGetContext = HTMLCanvasElement.prototype.getContext;
	origToDataURL = HTMLCanvasElement.prototype.toDataURL;
	HTMLCanvasElement.prototype.getContext = (() =>
		makeCtx(filterLog)) as unknown as typeof HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,STUB";
});

afterEach(() => {
	HTMLCanvasElement.prototype.getContext = origGetContext;
	HTMLCanvasElement.prototype.toDataURL = origToDataURL;
});

describe("slideThumbnail blur (Phase 5)", () => {
	it("blur:true で画像描画時に ctx.filter が blur(...) に設定される", async () => {
		await generateSlideThumbnailDataURL(doc(), imageMap, { blur: true, maxPx: 120 });
		expect(filterLog.some((f) => f.startsWith("blur("))).toBe(true);
	});

	it("blur 指定なしでは blur filter を設定しない", async () => {
		await generateSlideThumbnailDataURL(doc(), imageMap, { maxPx: 120 });
		expect(filterLog.some((f) => f.startsWith("blur("))).toBe(false);
	});
});
