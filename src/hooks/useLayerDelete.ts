import { useCallback } from "react";
import { useSlideStore } from "../state/slideStore";
import { sharedSiblingCount } from "../utils/layerOps";
import { useAlert } from "./useAlert";
import { useLayerMutation } from "./useLayerMutation";

// レイヤー削除 (shared 連鎖確認付き) を EditOpsPanel / LayerListPanel で共有するためのフック。
// レガシー挙動: shared 兄弟があれば「全て削除 / このスライドのみ」を確認し、無ければ単純削除。
// (削除可否 (locked 等) のガードは呼び出し側の責務)。
export const useLayerDelete = (): ((layerIndex: number) => Promise<void>) => {
	const alert = useAlert();
	const { removeLayer, removeLayerWithSharedSiblings } = useLayerMutation();
	return useCallback(
		async (layerIndex: number) => {
			if (layerIndex < 0) return;
			const { slides, selectedIndex } = useSlideStore.getState();
			const sibCount = sharedSiblingCount({ slides, selectedIndex }, layerIndex);
			if (sibCount > 0) {
				const all = await alert.confirm(
					`このレイヤーは他 ${sibCount} スライドと共有 (shared) されています。\n` +
						"OK: 共有先も含め全て削除 / キャンセル: このスライドのみ削除",
					{ okLabel: "全て削除", cancelLabel: "このスライドのみ" }
				);
				if (all) removeLayerWithSharedSiblings(layerIndex);
				else removeLayer(layerIndex);
			} else {
				removeLayer(layerIndex);
			}
		},
		[alert, removeLayer, removeLayerWithSharedSiblings]
	);
};
