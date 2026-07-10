import type { CSSProperties, FC } from "react";

// 隣接スライド間の joining インジケーター (v4 Group C C-3R で slide/ 配下に切り出し)。
//
// joining=true:  隙間ゼロ (辺をぴたりと接触させ、1 つに繋がっていることを示す)
// joining=false: 隙間 + 区切り線
//
// SlideListPanel は thumb 列の横 gap を 0 にし、区切りをこのインジケーターに一元化する。

interface SlideJoinIndicatorProps {
	joining: boolean;
}

export const SlideJoinIndicator: FC<SlideJoinIndicatorProps> = ({ joining }) => {
	if (joining) {
		// 結合中: 幅ゼロ + marginLeft -2px で次スライドを 2px (ボーダー幅ぶん) 引き寄せ、
		// 隣接スライドのボーダーを片側だけ重ねる。二重の継ぎ目が 1 本になり一体に見える。
		return <div style={{ width: 0, marginLeft: -2, flex: "0 0 auto" }} data-join="true" />;
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
