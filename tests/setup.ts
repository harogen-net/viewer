import "fake-indexeddb/auto";

// jsdom の HTMLImageElement.src は load イベントを発火しないため、
// テスト用に src setter をパッチして次マイクロタスクで load を発火する。
// これにより ImageManager.registImageData の Promise が解決可能になる。
const __imgSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
Object.defineProperty(HTMLImageElement.prototype, "src", {
	configurable: true,
	enumerable: true,
	get() {
		return __imgSrcDesc?.get?.call(this) ?? "";
	},
	set(value: string) {
		__imgSrcDesc?.set?.call(this, value);
		queueMicrotask(() => {
			this.dispatchEvent(new Event("load"));
		});
	},
});
