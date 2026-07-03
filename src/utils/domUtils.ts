// ブラウザ DOM 操作の共通ヘルパー (複数 component から使う副作用ユーティリティ)。
// pure な計算 (layerOps 等) とは別に、DOM/document に触れる処理をここへ集約する。

/**
 * edit canvas (scaled stage) 上に描画された layer wrapper の実寸 (offsetWidth/Height) を測る。
 * fit / align / clip が「表示中 layer の実サイズ」を必要とするため。scaled stage 配下に限定する
 * (LayerListPanel や thumb にも data-layer-id があり衝突するため)。未描画/ゼロサイズなら null。
 */
export const measureScaledLayerSize = (layerId: number): { w: number; h: number } | null => {
	const wrapper = document.querySelector<HTMLElement>(
		`[data-slide-edit-scaled] [data-layer-id="${layerId}"]`
	);
	if (!wrapper) return null;
	const w = wrapper.offsetWidth;
	const h = wrapper.offsetHeight;
	if (w <= 0 || h <= 0) return null;
	return { w, h };
};

/** dataURL を一時 <a download> でファイル保存する (画像レイヤー / 画像ライブラリの DL 共通)。 */
export const downloadDataUrl = (dataUrl: string, filename: string): void => {
	const a = document.createElement("a");
	a.href = dataUrl;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
};
