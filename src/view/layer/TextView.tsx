import { useEffect, useRef } from "react";
import { TextLayer } from "../../model/layer/TextLayer";
import { useLayerView, type LayerViewProps } from "../LayerView";

export const TextViewComponent = ({ layer, hostRef, ref }: LayerViewProps) => {
	useLayerView(layer, hostRef, ref);
	const textLayer = layer as TextLayer;
	const spanRef = useRef<HTMLSpanElement | null>(null);

	// span の実寸を model.originWidth/Height に反映（旧 TextView の挙動を踏襲し setTimeout で遅延）。
	useEffect(() => {
		const span = spanRef.current;
		if (!span) return;
		setTimeout(() => {
			textLayer.originWidth = span.offsetWidth;
			textLayer.originHeight = span.offsetHeight;
		}, 0);
	});

	return (
		<div
			className="text"
			style={{
				display: "inline-block",
				opacity: textLayer.opacity === 1 ? undefined : textLayer.opacity,
			}}
			contentEditable={false}
			spellCheck={false}
		>
			<span ref={spanRef}>{textLayer.text}</span>
		</div>
	);
};
