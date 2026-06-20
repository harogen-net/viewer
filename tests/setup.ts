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

// jsdom (25) の Blob には arrayBuffer() / text() が無い。FileReader 経由で polyfill。
// useFileIO.importFile が File.arrayBuffer() / File.text() を呼ぶため、test 環境
// でも本番と同じ経路で動作させるためのもの。
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
	Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as ArrayBuffer);
			reader.onerror = () => reject(reader.error);
			reader.readAsArrayBuffer(this);
		});
	};
}
if (typeof Blob !== "undefined" && typeof Blob.prototype.text !== "function") {
	Blob.prototype.text = function (this: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsText(this);
		});
	};
}

