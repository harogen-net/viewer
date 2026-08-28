/**
 * ドキュメントの永続 ID (docs/document-id-plan.md)。
 *
 * 実体は uuid 文字列。`type` の別名を切ってあるのは、このコードベースで `id` が
 * **数値**を意味してきたため (`Slide.id` / `Layer.id` は number、IDB の旧 `slideTitles.id` は
 * autoIncrement)。シグネチャを `loadById(id: DocId)` の形にして、呼び出し側で
 * 「これは数値の id ではない」と読めるようにする。
 *
 * title とは別物である点に注意: title は自由入力の表示名で重複してよく、
 * 同一性はこの DocId だけが担う。
 */
export type DocId = string;
