import type { CSSProperties, FC } from "react";

// 隣接スライド間の joining インジケーター (v4 Group C C-3R で slide/ 配下に切り出し)。
//
// joining=true:  細い接続線 (1 つに繋がっている)
// joining=false: 区切り線
//
// SlideListPanel が slides 間に挿入する。

interface SlideJoinIndicatorProps {
	joining: boolean;
}

export const SlideJoinIndicator: FC<SlideJoinIndicatorProps> = ({ joining }) => {
	if (joining) {
		const style: CSSProperties = {
			alignSelf: "center",
			width: 8,
			height: 2,
			background: "#868e96",
			flex: "0 0 auto",
		};
		return <div style={style} data-join="true" />;
	}
	const style: CSSProperties = {
		alignSelf: "stretch",
		width: 1,
		margin: "0 8px",
		background: "#dee2e6",
		flex: "0 0 auto",
	};
	return <div style={style} data-join="false" />;
};
