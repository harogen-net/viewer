// 保存ファイルの前後移動 (v4 Group D 補間、§0-10 新側内製)。
// レガシー src/viewController/file/FileSelector.ts の handleFileSelectClick 相当の
// index 計算を pure function に切り出したもの (UI / IDB から独立、単体テスト可能)。
//
// 仕様 (レガシー踏襲、ラップなし):
//   - count: 保存ファイル件数
//   - currentIndex: 現在選択中の index (未選択は -1)
//   - dir: "prev" (前/上) / "next" (次/下)
//   返り値: 移動先 index。移動できない場合は -1 (= 端で何もしない / 一覧空)。
//   - 未選択 (currentIndex < 0) からの "next" は先頭 (0) を返す
//     (レガシー: 初期 option から下キーで最初のファイルへ)。
//   - 未選択からの "prev" は移動なし (-1)。
//   - 端 (先頭の prev / 末尾の next) は移動なし (-1)。ラップしない。
export const adjacentTitleIndex = (
	count: number,
	currentIndex: number,
	dir: "prev" | "next"
): number => {
	if (count <= 0) return -1;
	if (dir === "next") {
		if (currentIndex < 0) return 0;
		return currentIndex < count - 1 ? currentIndex + 1 : -1;
	}
	// prev
	return currentIndex > 0 ? currentIndex - 1 : -1;
};
