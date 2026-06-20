import { useCallback } from "react";
import type { ViewerDocument } from "../types/ViewerDocument";
import { generateSlideThumbnailDataURL } from "../utils/slideThumbnail";
import {
	parseHvd,
	parseHvz,
	parsePng,
	serializeHvd,
	serializeHvz,
	serializePng,
} from "../utils/storageCodec";

// ファイル import / export を担う React hook (v3 Group B build、§0-10 新側内製)。
// レガシー src/Viewer.ts の .import / .export ハンドラ群に相当する純機能を
// FileIOPanel から切り出したもの。
//
// 設計方針: store 依存なし。viewerDocument と imageMap は呼び出し側から注入する。
// import 系は store を更新せず {doc, imageData} を返す (caller が store 反映)。
// export 系はメッセージ文字列 (UI 表示用) を返す。失敗時は throw。

/** Blob をダウンロードさせるヘルパー (URL.createObjectURL + <a download>)。 */
const downloadBlob = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
};

export interface ImportResult {
	doc: ViewerDocument;
	imageData: Record<string, string>;
}

export interface UseFileIO {
	exportHvd: (doc: ViewerDocument, imageMap: Record<string, string>) => Promise<string>;
	exportHvz: (doc: ViewerDocument, imageMap: Record<string, string>) => Promise<string>;
	exportPng: (doc: ViewerDocument, imageMap: Record<string, string>) => Promise<string>;
	importFile: (file: File) => Promise<ImportResult | null>;
}

export const useFileIO = (): UseFileIO => {
	const exportHvd = useCallback(
		async (doc: ViewerDocument, imageMap: Record<string, string>): Promise<string> => {
			const json = serializeHvd(doc, imageMap);
			const filename = `${doc.title || "document"}.hvd`;
			downloadBlob(new Blob([json], { type: "application/json" }), filename);
			return `exported: ${filename}`;
		},
		[],
	);

	const exportHvz = useCallback(
		async (doc: ViewerDocument, imageMap: Record<string, string>): Promise<string> => {
			const u8a = await serializeHvz(doc, imageMap);
			const filename = `${doc.title || "document"}.hvz`;
			downloadBlob(new Blob([u8a], { type: "application/zip" }), filename);
			return `exported: ${filename}`;
		},
		[],
	);

	// PNG は legacy SlideStorage 互換でファイル名先頭に `[hv]` prefix。
	// thumbnail は slideThumbnail で 1 枚目代表 slide を画像レイヤーのみ描画。
	const exportPng = useCallback(
		async (doc: ViewerDocument, imageMap: Record<string, string>): Promise<string> => {
			const thumbnailPngDataURL =
				(await generateSlideThumbnailDataURL(doc, imageMap).catch(() => null)) ?? undefined;
			const u8a = await serializePng(doc, imageMap, { thumbnailPngDataURL });
			const filename = `[hv]${doc.title || "document"}.png`;
			downloadBlob(new Blob([u8a], { type: "image/png" }), filename);
			return `exported: ${filename}`;
		},
		[],
	);

	// .hvd / .hvz / .png ファイルを parse して {doc, imageData} を返す。
	// 未対応拡張子は null。store 更新は caller の責務。
	const importFile = useCallback(async (file: File): Promise<ImportResult | null> => {
		if (/\.hvz$/i.test(file.name)) {
			const buf = await file.arrayBuffer();
			return await parseHvz(buf, file.name.replace(/\.hvz$/i, ""));
		}
		if (/\.png$/i.test(file.name)) {
			const buf = new Uint8Array(await file.arrayBuffer());
			// legacy 互換: ファイル名から [hv] prefix と .png 拡張子を外して fallback title に
			const fallback = file.name.replace(/^\[hv\]/, "").replace(/\.png$/i, "");
			return await parsePng(buf, fallback);
		}
		if (/\.hvd$/i.test(file.name)) {
			const text = await file.text();
			return parseHvd(text, file.name.replace(/\.hvd$/i, ""));
		}
		return null;
	}, []);

	return { exportHvd, exportHvz, exportPng, importFile };
};
