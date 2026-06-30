import { useImageLibraryStore } from "@/state/imageLibraryStore";
import type { ImageLayer, Layer, TextLayer } from "@/types/Layer";
import { LayerType } from "@/types/Layer";
import type { CSSProperties, FC } from "react";

// レイヤー 1 枚の中身描画 FC (v3 Group A build 2、§0-10 新側内製)。
// レガシー view/LayerView.ts / view/layer/*.ts は import せず新規実装。
//
// 役割: layer type (image / text) に応じてコンテンツ要素 (img / div) を出す。
// 位置・回転・スケール・opacity・visible は親の LayerView が wrapper 側で処理する
// ため、ここでは transform を持たない。コンテンツは natural size でレイアウトされ、
// wrapper の transform-origin (default = 50% 50%) はそのコンテンツ中心基準になる。
//
// imageData は HVD 内に `{imageId: dataURL}` として埋め込まれており、
// hooks/useStorage が parseHvd 経由で imageLibraryStore に投入する。
// clipRect は CSS clip-path: inset(top right bottom left) で適用 (legacy ImageView.ts L43-58 互換)。

const ImageLayerContent: FC<{ layer: ImageLayer; clip?: ClipOptions }> = ({ layer, clip }) => {
	const entry = useImageLibraryStore((s) => s.imageById[layer.imageId]);
	if (entry) {
		const [top, right, bottom, left] = layer.clipRect;
		const isClipped = top !== 0 || right !== 0 || bottom !== 0 || left !== 0;
		// 通常は clip がある時だけ clip-path を出す。スライドショー keep tween では
		// forceInset で常に inset を出し (clip 無し=inset 0)、隣接フレーム間で値を補間可能にする。
		const showClip = isClipped || !!clip?.forceInset;
		const clipStyle: CSSProperties = {};
		if (showClip) {
			const inset = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
			clipStyle.clipPath = inset;
			clipStyle.WebkitClipPath = inset;
		}
		// tween 時のみ clip-path に transition を付与 (legacy ImageView 同様、bezier 補間)。
		if (clip?.transitionMs != null) {
			const b = "cubic-bezier(.4,0,.7,1)";
			clipStyle.transition = `clip-path ${clip.transitionMs}ms ${b}, -webkit-clip-path ${clip.transitionMs}ms ${b}`;
		}
		return (
			<img
				src={entry.dataURL}
				alt={entry.name ?? layer.name ?? layer.imageId.slice(0, 8)}
				draggable={false}
				style={{ display: "block", userSelect: "none", ...clipStyle }}
			/>
		);
	}
	// dataURL 未解決 (HVD に imageData なし、または別 imageId)。Group A 暫定 placeholder。
	return (
		<div
			style={{
				width: 80,
				height: 80,
				background: "rgba(136,136,136,0.6)",
				outline: "1px dashed #fff",
				color: "#fff",
				fontFamily: "monospace",
				fontSize: 10,
				padding: 2,
				boxSizing: "border-box",
			}}
			title={`img ${layer.imageId} (no dataURL)`}>
			img {layer.imageId.slice(0, 8)}
		</div>
	);
};

// レガシー .slide .text CSS (css/index.css L282-291) をそのまま適用。
// 元の構造は <div class="text"><span>{text}</span></div>。
// display:inline-block + width:auto + height:auto により browser layout が
// テキスト intrinsic 幅高を確定 → wrapper (inline-block) もそれに包まれる。
const textStyle: CSSProperties = {
	display: "inline-block",
	width: "auto",
	height: "auto",
	fontFamily: '"メイリオ", "Meiryo", sans-serif',
	fontWeight: "bold",
	fontSize: 48,
	lineHeight: "52px",
	whiteSpace: "pre",
	color: "white",
	textShadow:
		"-1px -1px 20px rgba(0,0,0,0.6), -1px 1px 20px rgba(0,0,0,0.6), 1px -1px 20px rgba(0,0,0,0.6), 1px 1px 20px rgba(0,0,0,0.6)",
};

const TextLayerContent: FC<{ layer: TextLayer }> = ({ layer }) => (
	<div style={textStyle}>{layer.text}</div>
);

/**
 * 画像 clip-path の描画オプション (スライドショー keep tween 専用)。
 *   - forceInset: clip 無しでも inset(0...) を出す (隣接フレームで clip-path を補間可能にする)
 *   - transitionMs: 指定時、clip-path に transition を付与し補間する
 */
export interface ClipOptions {
	forceInset?: boolean;
	transitionMs?: number;
}

/**
 * Layer discriminated union を type ごとの FC に dispatch する。
 * shape / layer (group) 型は v2 起点では未使用、未対応 type は null を返す。
 * clip は image レイヤーのスライドショー tween 時のみ指定 (それ以外は従来どおり)。
 */
export const LayerContent: FC<{ layer: Layer; clip?: ClipOptions }> = ({ layer, clip }) => {
	if (layer.type === LayerType.IMAGE) return <ImageLayerContent layer={layer} clip={clip} />;
	if (layer.type === LayerType.TEXT) return <TextLayerContent layer={layer} />;
	return null;
};
