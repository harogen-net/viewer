import { useEffect, useRef } from "react";
import { ImageLayer } from "../../model/layer/ImageLayer";
import { ImageManager } from "../../utils/ImageManager";
import { useLayerView, type LayerViewProps } from "../LayerView";

export const ImageViewComponent = ({ layer, hostRef, ref }: LayerViewProps) => {
	const imageLayer = layer as ImageLayer;
	useLayerView(layer, hostRef, ref, {
		getWidth: (host) =>
			!host || host.offsetWidth === 0
				? imageLayer.scaleX * imageLayer.originWidth
				: host.offsetWidth,
		getHeight: (host) =>
			!host || host.offsetHeight === 0
				? imageLayer.scaleY * imageLayer.originHeight
				: host.offsetHeight,
	});
	const imgRef = useRef<HTMLImageElement | null>(null);

	const src = ImageManager.shared.getSrcById(imageLayer.imageId);
	const clipPath = imageLayer.isClipped
		? "inset(" + imageLayer.clipRect.map((value) => value + "px").join(" ") + ")"
		: "inset(0)";

	// React の style プロパティでは -webkit-clip-path をベンダ接頭辞付きで指定できないため
	// useEffect で imperative に適用する。
	useEffect(() => {
		if (imgRef.current) {
			imgRef.current.style.setProperty("-webkit-clip-path", clipPath);
		}
	}, [clipPath]);

	return (
		<img
			ref={imgRef}
			src={src}
			style={{
				opacity: imageLayer.opacity === 1 ? undefined : imageLayer.opacity,
				clipPath,
			}}
		/>
	);
};
