# ドキュメント ID 導入 実装計画（IDB スキーマ v3）

> ステータス: **未着手**（2026-08-28 合意）。実装前の設計記録。未決事項は無い。

## 関連ドキュメント

- [cloud-sync-plan.md](cloud-sync-plan.md) — 本作業を前提とする後続機能
- [data-compatibility-spec.md](data-compatibility-spec.md) — 保存形式の互換要件（HVD へのフィールド追加）
- [mode-spec.md](mode-spec.md) §3.2 — 書込ゲートの掛かる範囲

---

## 1. 動機

**ドキュメントに同一性がない。** すべて `title` がキーになっている。

```
useStorage.ts   createObjectStore("slideData",       { keyPath: "title" })
                createObjectStore("slideThumbnails", { keyPath: "title" })
                loadByTitle() / deleteByTitle() / getThumbnail(title)
```

`ViewerDocument` 型にも ID 相当のフィールドはない。この状態で困ることが 2 つある。

### 1.1 クラウド同期が成立しない

[cloud-sync-plan.md](cloud-sync-plan.md) は「updatedAt 後勝ち（LWW）」で衝突を解決する設計だが、
これは同一性が前提の仕組みである。ID が無いと**リネームが「削除 + 新規」に見え**、逆に
**2 台で同名の文書を作れば別物が同一視される**。

同期を先に作ると、クラウド上の `index.enc` も title で組まれる。後から ID を入れる場合は
両端末のクラウドマニフェストまで移行対象になり、しかも「2 台が同時に古い版を見ている」状態を
跨ぐことになる。**今ならローカル IDB だけで済む。**

### 1.2 リネームすると旧レコードが残る

[DocumentSettingsModal](../src/components/panels/DocumentSettingsModal.tsx) はタイトルを編集でき、
保存は `override ? doc.title : 日付文字列` を書き込む（`useStorage.ts` の `save`）。
**旧タイトルのレコードを削除する処理は無い**（`deleteByTitle` の呼出は明示削除の 2 箇所のみ）。
リネーム後に保存すると、旧レコードとそのサムネがそのまま残る。

ID を導入すれば「同じ文書の title が変わった」として自然に解決する。

## 2. 目標スキーマ

```
DB "viewer" version 3
  docs       { id, title, update, isSensitive }   keyPath: "id"      … id: DocId (uuid)
  docData    { docId, data }                       keyPath: "docId"
  docThumbs  { docId, thumb, frames }              keyPath: "docId"
  index      docs.title (非ユニーク) … 名前引き・重複検出用

HVD ルート    docId: string                        … 追加互換フィールド
```

### 2.1 命名の根拠

- **主キーは自ストア内で `id`、参照する側が `docId`。** 関係モデルの通常の形。
- **`type DocId = string` の別名を用意する。** このコードベースで `id` は数値を意味しており
  （`Slide.id` / `Layer.id` は number、現行 `StoredSlideTitle.id` は autoIncrement）、
  UUID の `id` は読み手が型を取り違える。シグネチャを `loadById(id: DocId)` の形にする。
- **DTO 名を分ける。** 旧 `StoredSlideTitle`（`id: number`）は移行完了まで残るので、新規は
  `StoredDoc` とする。同名の型を使い回すと移行コードで事故る。
- **HVD ファイル内は `docId`。** ファイル内には既に `Slide.id` / `Layer.id` があり、そこへ
  ドキュメントの `id` を置くと文脈が曖昧になる。ファイル内では外部参照的な意味なので `docId`、
  `docs` ストア内では主キーなので `id`。非対称だが各文脈で正しい。

### 2.2 スキーマを自由に変えられる理由

`slideTitles` / `slideData` は「レガシー互換」として jQuery 実装と共有していたが、レガシーは
`15398fc4` で削除済み。エントリは `main.tsx` 単一で、**IDB を開くのは `useStorage.ts` の 1 箇所だけ**。
形を変えて壊れる相手がいない。

## 3. 移行

### 3.1 keyPath は変更できない

**IndexedDB は既存ストアの `keyPath` を後から変更できない。** `createObjectStore` 時に確定する。
したがって「新ストアを作って中身を移す」以外の方法が無い。これは設計判断ではなく仕様上の強制。

### 3.2 2 段階に分ける

**段階 1 — `onupgradeneeded`（v2 → v3）では空の新ストアを作るだけ。**
旧 3 ストアはそのまま残す。データを動かさないので一瞬で終わる。

**段階 2 — DB を開いた後、1 文書 1 トランザクションで移す。**
旧レコードを読む → `docId` 採番 → 新ストアへ書く → 旧レコードを削除、を繰り返す。

分ける理由は**所要時間**である。IDB のアップグレードトランザクションは原子的なので、途中で
失敗しても半端な状態にはならず、その点の心配は要らない。問題は、数 MB の JSON を全文書ぶん
アップグレード内で書き換えるとその間タブが固まり、失敗すればロールバックして毎回最初から
やり直しになること。1 文書ずつ別トランザクションにすれば、既存の `useProgress` で進捗を出せ、
中断しても未移行分が旧ストアに残るだけなので次回起動から再開できる。

**旧ストアの削除は後続バージョン（v4）で行う。** 移行直後に消さないのは、移行に不具合が
あった場合の復旧余地を残すため。

### 3.3 採番規則

| 操作 | docId |
| --- | --- |
| 上書き保存 | 維持 |
| リネーム後の保存 | **維持**（本作業の目的） |
| 別名で保存 | **新規採番** |
| 既存 IDB レコードの移行 | 移行時に採番 |
| `docId` 無しファイルの読込 | 読込時は採番せず、**保存時に確定** |

最後の行の理由: 読込時に採番すると、同じファイルを 2 回開いただけで 2 個の ID ができる。

**割り切り**: `docId` を持たない同じファイルを 2 台で別々にインポートすると別 ID になる。
ファイル配布の宿命であり、どちらか一方で保存したファイルを配れば揃う。

## 4. 影響範囲

| 対象 | 内容 |
| --- | --- |
| `src/hooks/useStorage.ts` | スキーマ v3、新旧ストア、移行パス、CRUD 全面（`loadByTitle` → `loadById` 等） |
| `src/utils/storageCodec.ts` | HVD への `docId` 読み書き |
| `src/types/ViewerDocument.ts` / `src/state/viewerDocumentStore.ts` | 型と meta への `docId` |
| UI 4 ファイル | `selectedTitle`（17 参照）→ `selectedId`。`FileSelector` は select の value が title |
| 移行のテスト | v2 データから v3 への移行、中断・再開 |

`title` を扱う箇所は 10 ファイル / 67 参照あるが、大半は表示用でありキーとして使っているのは
上記に限られる。

**コミット 3〜4 本**の見込み。実装より**移行の検証が主戦場**になる。

## 5. テスト観点

- v2 スキーマの既存データ（複数文書 + サムネ + センシティブ文書）が v3 へ移り、全件ロードできる
- 移行を途中で中断しても、次回起動で残りが移り、二重採番が起きない
- リネームして保存しても `docId` が変わらず、旧レコードが残らない
- 別名で保存は新しい `docId` を採番する
- `docId` を持たない HVD を読み込み、保存すると `docId` が確定する
- 同じ文書を 2 回保存しても `docId` が増えない
- レガシー（`docId` 無し）HVD の読込が壊れない
- **同名の文書を 2 件保存でき、それぞれ独立にロード / 削除できる**（§6）

## 6. title の重複を許す

現在は title が主キーなので同名文書を作れないが、`docId` 主キーにすると作れるようになる。
**重複を許す**（2026-08-28 決定）。title は自由入力の表示名であり、一意性を要求する筋合いが無い。
`docs.title` インデックスは非ユニークとする。

これに伴う UI 側の要件が 2 つある。

- **`FileSelector` の select は `value` を `docId` にする（必須）。** 現在は title を value に
  しており、同名が 2 件あると選択が壊れる。「表示は title、値は docId」に変える。
- **`DocumentPickerModal` に更新日時を表示する。** 現在はサムネと title のみで、同名文書が
  並ぶと見分けが付かない。`update` は既に `StoredDoc` が持っているので表示するだけでよい
  （一覧は既に update 降順でソート済み）。

## 7. 実装時に忘れないこと

- 既存データを壊すと復旧手段が無い。**v2 相当の fixture を用意してから着手する**
- `useStorage.ts` の冒頭コメント（IDB スキーマの説明）を更新する
- [data-compatibility-spec.md](data-compatibility-spec.md) §4 の互換対象フィールドへ `docId` を追記し、
  §12 のとおり保存形式変更として `version` の扱いを確認する
- 本作業の完了後に [cloud-sync-plan.md](cloud-sync-plan.md) のオープン事項 4（docId 採番）を閉じる
