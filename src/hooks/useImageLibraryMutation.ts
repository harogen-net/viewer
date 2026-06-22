import { useCallback } from "react";
import { useImageLibraryStore } from "../state/imageLibraryStore";
import { useLayerStore } from "../state/layerStore";
import { useSlideStore } from "../state/slideStore";
import { sha256DataUrl } from "../utils/imageHash";
import { useLayerMutation } from "./useLayerMutation";

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
	 * 選択中の slide に imageId の画像を中央 contain 配置で追加。
	 *   - aspect 維持で slide に収まる最大サイズ (scale = min(slideW/imgW, slideH/imgH))
	 *   - visual center を slide 中央に配置
	 *   - 追加後はその layer を selectedLayer に設定 (不要なら false 返し不選択でも可)
	 * @returns true = 配置成功 / false = 選択 slide 無し or 画像本体未ロード
	 */
	placeImageOnSlide: (imageId: string) => Promise<boolean>;
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

	const addImageDataUrl = useCallback(
		async (dataUrl: string, name?: string): Promise<string> => {
			const id = await sha256DataUrl(dataUrl);
			const existing = useImageLibraryStore.getState().imageById[id];
			if (existing) return id;
			addImage(id, { dataURL: dataUrl, name });
			return id;
		},
		[addImage],
	);

	const addImageFile = useCallback(
		async (file: File, name?: string): Promise<string> => {
			if (!file.type.startsWith("image/")) {
				throw new Error(`not an image file: ${file.type}`);
			}
			const dataUrl = await readFileAsDataUrl(file);
			return addImageDataUrl(dataUrl, name ?? file.name);
		},
		[addImageDataUrl],
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
		[removeImage, removeLayersByImageId],
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
			// 自動向き決定: 0° と -90° を比較し、より大きく fit する向き (= slide aspect に近い方) を選ぶ。
			// legacy EditableSlideView の drop ハンドラ相当 (`originHeight > originWidth * 1.2` で -90°)
			// を、より一般的な「contain scale が大きい方を選ぶ」基準に拡張。
			//   - rotation=0: contain scale = min(slideW/w, slideH/h)
			//   - rotation=-90°: 効果的に (h, w) を slide に fit → scale = min(slideW/h, slideH/w)
			// scale 同点なら 0° (デフォルト無変換) を優先。
			const scale0 = Math.min(slide.width / w, slide.height / h);
			const scaleR = Math.min(slide.width / h, slide.height / w);
			const useRotation = scaleR > scale0;
			const rotation = useRotation ? -90 : 0;
			const scale = useRotation ? scaleR : scale0;
			// visual center を slide 中央へ: transX = slideW/2 - imgW/2 (transform-origin: 50% 50%、回転は中心軸)
			addLayer({
				name: entry.name ?? "",
				opacity: 1,
				locked: false,
				visible: true,
				shared: false,
				transX: slide.width / 2 - w / 2,
				transY: slide.height / 2 - h / 2,
				scaleX: scale,
				scaleY: scale,
				rotation,
				mirrorH: false,
				mirrorV: false,
				type: "image",
				imageId,
				clipRect: [0, 0, 0, 0],
				isText: false,
			});
			// 追加後の last layer (新規 追加された layer) を選択状態にする
			const updatedSlide = useSlideStore.getState().slides[selectedIndex];
			const added = updatedSlide?.layers[updatedSlide.layers.length - 1];
			if (added) useLayerStore.getState().setSelectedLayer(added);
			return true;
		},
		[addLayer],
	);

	return { addImageFile, addImageDataUrl, deleteImage, placeImageOnSlide };
};
