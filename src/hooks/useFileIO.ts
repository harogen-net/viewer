import { useSensitivePassword } from "@/hooks/useSensitivePassword";
import type { ViewerDocument } from "@/types/ViewerDocument";
import {
	type EncryptedImageData,
	decryptImageData,
	encryptImageData,
} from "@/utils/sensitiveCrypto";
import { drawSlideToCanvas, generateSlideThumbnailDataURL } from "@/utils/slideThumbnail";
import {
	type ParsedHvd,
	collectReferencedImages,
	parseHvd,
	parseHvz,
	parsePng,
	serializeHvd,
	serializeHvz,
	serializePng,
} from "@/utils/storageCodec";
import JSZip from "jszip";
import { useCallback } from "react";

// ファイル import / export を担う React hook (v3 Group B build、§0-10 新側内製)。
// レガシー src/Viewer.ts の .import / .export ハンドラ群に相当する純機能を
// FileIOPanel から切り出したもの。
//
// 設計方針: store 依存なし。viewerDocument と imageMap は呼び出し側から注入する。
// import 系は store を更新せず {doc, imageData} を返す (caller が store 反映)。
// export 系はメッセージ文字列 (UI 表示用) を返す。失敗時は throw。

// FileReader ベースのファイル読み込み (全 iOS Safari で動作)。Blob.arrayBuffer/text は
// Safari 14+ 限定のため、旧 iOS でも import できるよう FileReader を使う (legacy 同方針)。
const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as ArrayBuffer);
		reader.onerror = () => reject(reader.error ?? new Error("FileReader: 読み込み失敗"));
		reader.readAsArrayBuffer(file);
	});

const readFileAsText = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error ?? new Error("FileReader: 読み込み失敗"));
		reader.readAsText(file);
	});

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

/** canvas → PNG Blob (toDataURL ではなく toBlob でメモリ効率よく)。 */
const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
	new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob が null を返しました"))),
			"image/png"
		);
	});

export interface ImportResult {
	doc: ViewerDocument;
	imageData: Record<string, string>;
}

export interface UseFileIO {
	// export (HVD/HVZ/PNG) はセンシティブ時 PW 入力を伴い、キャンセルで null を返す。
	exportHvd: (doc: ViewerDocument, imageMap: Record<string, string>) => Promise<string | null>;
	exportHvz: (doc: ViewerDocument, imageMap: Record<string, string>) => Promise<string | null>;
	exportPng: (doc: ViewerDocument, imageMap: Record<string, string>) => Promise<string | null>;
	importFile: (file: File) => Promise<ImportResult | null>;
	/**
	 * 指定 index のスライドを native 寸法 PNG で書き出す (§4/§10、legacy downloadImage(index))。
	 * 背景は doc.bgColor を使用 (透明出力はオミット)。filename = `{title}_{index+1}.png`。
	 */
	exportSlidePng: (
		doc: ViewerDocument,
		imageMap: Record<string, string>,
		index: number
	) => Promise<string>;
	/**
	 * 有効 (非 disabled) な全スライドを PNG 化し ZIP で書き出す (§10、legacy downloadImage(-1))。
	 * 背景は doc.bgColor。ファイル名は元の index で `{title}_{index+1}.png` (disabled はスキップ)。
	 * 有効スライドが 0 枚なら throw。
	 */
	exportAllSlidesZip: (doc: ViewerDocument, imageMap: Record<string, string>) => Promise<string>;
}

export const useFileIO = (): UseFileIO => {
	const { ensurePassword, unlock } = useSensitivePassword();

	// センシティブ export 前処理: 参照画像を PW で暗号化。非 sensitive は素通り、
	// PW 入力キャンセルは cancelled=true (export 中止)。
	const encryptForExport = useCallback(
		async (
			doc: ViewerDocument,
			imageMap: Record<string, string>
		): Promise<{ cancelled: boolean; encrypted?: EncryptedImageData }> => {
			if (!doc.isSensitive) return { cancelled: false };
			const pw = await ensurePassword();
			if (pw === null) return { cancelled: true };
			return {
				cancelled: false,
				encrypted: await encryptImageData(collectReferencedImages(doc, imageMap), pw),
			};
		},
		[ensurePassword]
	);

	const exportHvd = useCallback(
		async (doc: ViewerDocument, imageMap: Record<string, string>): Promise<string | null> => {
			const { cancelled, encrypted } = await encryptForExport(doc, imageMap);
			if (cancelled) return null;
			const json = serializeHvd(doc, imageMap, { encrypted });
			const filename = `${doc.title || "document"}.hvd`;
			downloadBlob(new Blob([json], { type: "application/json" }), filename);
			return `exported: ${filename}`;
		},
		[encryptForExport]
	);

	const exportHvz = useCallback(
		async (doc: ViewerDocument, imageMap: Record<string, string>): Promise<string | null> => {
			const { cancelled, encrypted } = await encryptForExport(doc, imageMap);
			if (cancelled) return null;
			const u8a = await serializeHvz(doc, imageMap, { encrypted });
			const filename = `${doc.title || "document"}.hvz`;
			downloadBlob(new Blob([u8a], { type: "application/zip" }), filename);
			return `exported: ${filename}`;
		},
		[encryptForExport]
	);

	// PNG は legacy SlideStorage 互換でファイル名先頭に `[hv]` prefix。
	// thumbnail は slideThumbnail で 1 枚目代表 slide を画像レイヤーのみ描画。
	// センシティブ時は素サムネで内容が漏れるため埋め込まない (Phase 5 でぼかしに置換予定)。
	const exportPng = useCallback(
		async (doc: ViewerDocument, imageMap: Record<string, string>): Promise<string | null> => {
			const { cancelled, encrypted } = await encryptForExport(doc, imageMap);
			if (cancelled) return null;
			// センシティブ時は内容が判別できないようぼかした代表サムネを埋め込む (§sensitive-mode-spec)。
			const thumbnailPngDataURL =
				(await generateSlideThumbnailDataURL(doc, imageMap, { blur: doc.isSensitive }).catch(
					() => null
				)) ?? undefined;
			const u8a = await serializePng(doc, imageMap, { thumbnailPngDataURL, encrypted });
			const filename = `[hv]${doc.title || "document"}.png`;
			downloadBlob(new Blob([u8a], { type: "image/png" }), filename);
			return `exported: ${filename}`;
		},
		[encryptForExport]
	);

	// スライド 1 枚を native 寸法 PNG で書き出す (§4/§10)。背景は doc.bgColor。
	const exportSlidePng = useCallback(
		async (
			doc: ViewerDocument,
			imageMap: Record<string, string>,
			index: number
		): Promise<string> => {
			const slide = doc.slides[index];
			if (!slide) throw new Error(`invalid slide index: ${index}`);
			const canvas = await drawSlideToCanvas(slide, doc.bgColor, imageMap);
			const blob = await canvasToPngBlob(canvas);
			const filename = `${doc.title || "document"}_${index + 1}.png`;
			downloadBlob(blob, filename);
			return `exported: ${filename}`;
		},
		[]
	);

	// 有効スライドを全て PNG 化して ZIP 出力 (§10)。命名は元 index 基準 (disabled はスキップ)。
	const exportAllSlidesZip = useCallback(
		async (doc: ViewerDocument, imageMap: Record<string, string>): Promise<string> => {
			const enabledCount = doc.slides.filter((s) => !s.disabled).length;
			if (enabledCount === 0) {
				throw new Error("有効なスライドがありません (最低 1 枚を有効化してください)");
			}
			const zip = new JSZip();
			const title = doc.title || "document";
			// foreach で同時 toBlob すると不安定なため逐次 await (legacy DropHelper 同様の方針)。
			for (let i = 0; i < doc.slides.length; i++) {
				const slide = doc.slides[i];
				if (slide.disabled) continue;
				const canvas = await drawSlideToCanvas(slide, doc.bgColor, imageMap);
				const blob = await canvasToPngBlob(canvas);
				zip.file(`${title}_${i + 1}.png`, blob);
			}
			const out = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
			const filename = `${title}.zip`;
			downloadBlob(out, filename);
			return `exported: ${filename}`;
		},
		[]
	);

	// .hvd / .hvz / .png ファイルを parse して {doc, imageData} を返す。
	// 未対応拡張子は null。store 更新は caller の責務。
	//
	// ファイル読み込みは Blob.arrayBuffer()/text() (Safari 14+) ではなく FileReader を使う。
	// 旧 iOS Safari には Blob.arrayBuffer/text が無く、レガシー (FileReader 方式) は動くのに
	// 新側だけ import が失敗する事象があったため、全 iOS で動く FileReader に統一する。
	const importFile = useCallback(
		async (file: File): Promise<ImportResult | null> => {
			let parsed: ParsedHvd | null = null;
			if (/\.hvz$/i.test(file.name)) {
				parsed = await parseHvz(await readFileAsArrayBuffer(file), file.name.replace(/\.hvz$/i, ""));
			} else if (/\.png$/i.test(file.name)) {
				const buf = new Uint8Array(await readFileAsArrayBuffer(file));
				// legacy 互換: ファイル名から [hv] prefix と .png 拡張子を外して fallback title に
				const fallback = file.name.replace(/^\[hv\]/, "").replace(/\.png$/i, "");
				parsed = await parsePng(buf, fallback);
			} else if (/\.hvd$/i.test(file.name)) {
				parsed = parseHvd(await readFileAsText(file), file.name.replace(/\.hvd$/i, ""));
			}
			if (!parsed) return null; // 未対応拡張子
			// センシティブ: 解錠ループで復号。キャンセルはロック状態 (画像空) で import。
			if (parsed.encrypted) {
				const enc = parsed.encrypted;
				const imageData = await unlock((pw) => decryptImageData(enc, pw));
				return { doc: parsed.doc, imageData: imageData ?? {} };
			}
			return { doc: parsed.doc, imageData: parsed.imageData };
		},
		[unlock]
	);

	return {
		exportHvd,
		exportHvz,
		exportPng,
		importFile,
		exportSlidePng,
		exportAllSlidesZip,
	};
};
