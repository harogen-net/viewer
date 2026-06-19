import type { CSSProperties, FC } from "react";
import { useImageLibraryStore } from "../../state/imageLibraryStore";
import type { ImageLayer, Layer, TextLayer } from "../../types/Layer";

// レイヤー 1 枚の中身描画 FC (v3 Group A build 2、§0-10 新側内製)。
// レガシー view/LayerView.ts / view/layer/*.ts は import せず新規実装。
//
// 役割: layer type (image / text) に応じてコンテンツ要素 (img / div) を出す。
// 位置・回転・スケール・opacity・visible は親の LayerView が wrapper 側で処理する
// ため、ここでは transform を持たない。コンテンツは natural size でレイアウトされ、
// wrapper の transform-origin (default = 50% 50%) はそのコンテンツ中心基準になる。
//
// imageData は HVD 内に `{imageId: dataURL}` として埋め込まれており、
// devFixtureLoader が imageLibraryStore に投入する。Group B/D では
// hooks/useImageLibrary 等に整理予定。clipRect 適用も Group B 以降。

const ImageLayerContent: FC<{ layer: ImageLayer }> = ({ layer }) => {
	const entry = useImageLibraryStore((s) => s.imageById[layer.imageId]);
	if (entry) {
		return (
			<img
				src={entry.dataURL}
				alt={entry.name ?? layer.name ?? layer.imageId.slice(0, 8)}
				draggable={false}
				style={{ display: "block", userSelect: "none" }}
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
			title={`img ${layer.imageId} (no dataURL)`}
		>
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
 * Layer discriminated union を type ごとの FC に dispatch する。
 * shape / layer (group) 型は v2 起点では未使用、未対応 type は null を返す。
 */
export const LayerContent: FC<{ layer: Layer }> = ({ layer }) => {
	if (layer.type === "image") return <ImageLayerContent layer={layer} />;
	if (layer.type === "text") return <TextLayerContent layer={layer} />;
	return null;
};
