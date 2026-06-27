import { useCallback, useEffect } from "react";
import { useImageLibraryStore } from "../state/imageLibraryStore";
import { useLayerStore } from "../state/layerStore";
import { useSlideStore } from "../state/slideStore";
import { useViewerDocumentStore } from "../state/viewerDocumentStore";
import { buildFitImageLayer } from "../utils/layerOps";
import { sha256DataUrl } from "../utils/imageHash";
import { useLayerMutation } from "./useLayerMutation";
import { useSlideMutation } from "./useSlideMutation";

// 画像ライブラリの consumer facade (v4 Group D D-6a)。
// レガシー src/utils/ImageManager.ts (jQuery + singleton) は import せず新規実装。
//
// 担当:
//   - File から dataURL 化 → imageId (SHA-256) 算出 → imageLibraryStore.addImage
//     (既存 imageId と一致したら no-op、新規なら 追加)
//   - imageId 指定で削除 → 全 slide から該当 ImageLayer も cascade 削除
//
// 履歴: legacy `HistoryManager.shared.initialize()` で削除時に履歴クリアしているが、
// 新側は cascade 削除を useLayerMutation 経由 (1 履歴) で記録するのみ
// (image add/delete 自体は HVD save 時の埋め込み対象が変わるだけで undo 不要)。
//
// imageId 算出: legacy CryptoJS.SHA256(dataURL).toString() 互換 (Web Crypto)。
// 同 dataURL の重複追加は同 imageId を返すため自動 dedupe される。

export interface UseImageLibraryMutation {
	/** File から画像を読み込み、imageId を返す。重複は既存 imageId を返す。 */
	addImageFile: (file: File, name?: string) => Promise<string>;
	/** dataURL から画像を直接追加 (drag & drop で外部 URL 経由など)。 */
	addImageDataUrl: (dataUrl: string, name?: string) => Promise<string>;
	/**
	 * imageId 指定で画像とそれを参照する全レイヤーを削除。
	 * 削除されたレイヤー件数を返す (0 = 該当レイヤー無し、画像のみ削除)。
	 */
	deleteImage: (imageId: string) => number;
	/**
	 * imageId がどの slide のどの ImageLayer からも参照されていなければ library から除去する
	 * (孤児画像の GC)。画像差し替え後に旧画像が残らないようにするのに使う。
	 * @returns true = 除去した / false = まだ参照あり (除去せず)
	 */
	pruneOrphanImage: (imageId: string) => boolean;
	/**
	 * 選択中の slide に imageId の画像を中央 contain 配置で追加。
	 *   - aspect 維持で slide に収まる最大サイズ (scale = min(slideW/imgW, slideH/imgH))
	 *   - visual center を slide 中央に配置
	 *   - 追加後はその layer を selectedLayer に設定 (不要なら false 返し不選択でも可)
	 * @returns true = 配置成功 / false = 選択 slide 無し or 画像本体未ロード
	 */
	placeImageOnSlide: (imageId: string) => Promise<boolean>;
	/**
	 * imageId の画像 1 枚を持つ新規 slide を末尾に追加し選択する (D-12、一覧への drop)。
	 * slide 寸法は document meta (width/height) を使用。中央 contain 配置 + 縦長自動回転。
	 * @returns true = 追加成功 / false = document 未ロード or 画像本体未ロード
	 */
	placeImageAsNewSlide: (imageId: string) => Promise<boolean>;
}

const readFileAsDataUrl = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
		reader.readAsDataURL(file);
	});

const loadImageNaturalSize = (dataUrl: string): Promise<{ w: number; h: number }> =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
		img.onerror = () => reject(new Error("image load failed"));
		img.src = dataUrl;
	});

export const useImageLibraryMutation = (): UseImageLibraryMutation => {
	const addImage = useImageLibraryStore((s) => s.addImage);
	const removeImage = useImageLibraryStore((s) => s.removeImage);
	const { addLayer, removeLayersByImageId } = useLayerMutation();
	const { addImageSlide } = useSlideMutation();

	const addImageDataUrl = useCallback(
		async (dataUrl: string, name?: string): Promise<string> => {
			const id = await sha256DataUrl(dataUrl);
			const existing = useImageLibraryStore.getState().imageById[id];
			if (existing) return id;
			// デコード可能性を検証してから登録する。HEIC 等ブラウザ非対応形式は MIME が
			// image/* でも <img> がデコードできず onerror になるため、ここで弾く
			// (登録/差し替えしてしまうとレイヤーが壊れて表示・編集不能になる)。
			// jsdom では tests/setup の src パッチで load が必ず発火するため通過する。
			try {
				await loadImageNaturalSize(dataUrl);
			} catch {
				throw new Error("この画像形式は表示できません (HEIC など未対応の可能性があります)");
			}
			addImage(id, { dataURL: dataUrl, name });
			return id;
		},
		[addImage]
	);

	const addImageFile = useCallback(
		async (file: File, name?: string): Promise<string> => {
			if (!file.type.startsWith("image/")) {
				throw new Error(`not an image file: ${file.type}`);
			}
			const dataUrl = await readFileAsDataUrl(file);
			return addImageDataUrl(dataUrl, name ?? file.name);
		},
		[addImageDataUrl]
	);

	const deleteImage = useCallback(
		(imageId: string): number => {
			// 先に該当 layer 数を数える
			const slides = useSlideStore.getState().slides;
			let count = 0;
			for (const s of slides) {
				for (const l of s.layers) {
					if (l.type === "image" && l.imageId === imageId) count++;
				}
			}
			// 該当 layer があれば cascade 削除 (履歴 1 件)
			if (count > 0) removeLayersByImageId(imageId);
			// 画像本体を library から削除
			removeImage(imageId);
			return count;
		},
		[removeImage, removeLayersByImageId]
	);

	const pruneOrphanImage = useCallback(
		(imageId: string): boolean => {
			const slides = useSlideStore.getState().slides;
			const stillUsed = slides.some((s) =>
				s.layers.some((l) => l.type === "image" && l.imageId === imageId)
			);
			if (stillUsed) return false;
			removeImage(imageId);
			return true;
		},
		[removeImage]
	);

	const placeImageOnSlide = useCallback(
		async (imageId: string): Promise<boolean> => {
			const entry = useImageLibraryStore.getState().imageById[imageId];
			if (!entry) return false;
			const { selectedIndex, slides } = useSlideStore.getState();
			if (selectedIndex < 0 || selectedIndex >= slides.length) return false;
			const slide = slides[selectedIndex];
			const { w, h } = await loadImageNaturalSize(entry.dataURL);
			if (w <= 0 || h <= 0) return false;
			// 中央 contain 配置 + 縦長自動回転 (buildFitImageLayer に集約、D-11/D-12 共通)。
			addLayer(buildFitImageLayer(slide.width, slide.height, w, h, imageId, entry.name));
			// 追加後の last layer (新規 追加された layer) を選択状態にする
			const updatedSlide = useSlideStore.getState().slides[selectedIndex];
			const added = updatedSlide?.layers[updatedSlide.layers.length - 1];
			if (added) useLayerStore.getState().setSelectedLayer(added);
			return true;
		},
		[addLayer]
	);

	const placeImageAsNewSlide = useCallback(
		async (imageId: string): Promise<boolean> => {
			const entry = useImageLibraryStore.getState().imageById[imageId];
			if (!entry) return false;
			const meta = useViewerDocumentStore.getState().meta;
			if (!meta) return false;
			const { w, h } = await loadImageNaturalSize(entry.dataURL);
			if (w <= 0 || h <= 0) return false;
			// document 寸法の新規 slide に中央 contain 配置 (legacy ListViewController drop 相当)。
			addImageSlide(
				meta.width,
				meta.height,
				buildFitImageLayer(meta.width, meta.height, w, h, imageId, entry.name)
			);
			return true;
		},
		[addImageSlide]
	);

	return {
		addImageFile,
		addImageDataUrl,
		deleteImage,
		pruneOrphanImage,
		placeImageOnSlide,
		placeImageAsNewSlide,
	};
};

/**
 * imageLibraryStore のうち自然寸法 (width/height) 未設定の entry を読み込んで backfill する hook (D-14)。
 * HVD/HVZ/PNG ロード (setImageLibrary) は dataURL のみで dims を持たないため、ロード後に
 * 画像を実 load して naturalWidth/Height を store へ書き戻す。rectEdit (§7) の矩形一致判定が
 * これを legacy originWidth/originHeight として参照する。
 *
 * 新モードのルート (AppShell) で 1 回マウントする。imageById 変化のたびに欠落分のみ補う。
 */
export const useImageDimensionBackfill = (): void => {
	const imageById = useImageLibraryStore((s) => s.imageById);
	const setImageDimensions = useImageLibraryStore((s) => s.setImageDimensions);

	useEffect(() => {
		const missing = Object.entries(imageById).filter(
			([, e]) => e.width === undefined || e.height === undefined
		);
		if (missing.length === 0) return;
		let cancelled = false;
		(async () => {
			for (const [id, entry] of missing) {
				try {
					const { w, h } = await loadImageNaturalSize(entry.dataURL);
					if (cancelled) return;
					setImageDimensions(id, w, h);
				} catch {
					// 読み込み失敗時はスキップ (dims 未設定のまま、rectEdit は当該 layer を対象外にする)
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [imageById, setImageDimensions]);
};
