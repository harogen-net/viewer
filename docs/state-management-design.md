# 状態管理設計書 (v2)

## 目的

React 移行後の状態管理を、jQuery + class + EventDispatcher の旧実装から
**純粋データ + Zustand store + 純粋 React FC** に置き換えるための設計指針を
定義する。

## 関連ドキュメント

- [docs/migration-roadmap-v2.md](migration-roadmap-v2.md)
- [docs/data-compatibility-spec.md](data-compatibility-spec.md)
- 旧 v1 設計: [docs/state-management-design.archived.md](state-management-design.archived.md) (参考のみ)

---

## 1. 根幹アーキテクチャ

本アプリの中核は `ViewerDocument → Slide → Layer` の **3 階層親子ヒエラルキー**。

```
ViewerDocument
  ├─ title / width / height / bgColor / createTime / editTime
  └─ slides: Slide[]
       └─ Slide
            ├─ id / uuid / width / height / durationRatio / joining / disabled
            └─ layers: Layer[]
                 └─ Layer (discriminated union)
                      ├─ ImageLayer: type="image", imageId, clipRect, isText, ...
                      └─ TextLayer:  type="text", text, ...
```

型定義は [src/types/ViewerDocument.ts](../src/types/ViewerDocument.ts) /
[src/types/Slide.ts](../src/types/Slide.ts) /
[src/types/Layer.ts](../src/types/Layer.ts) を **Single Source of Type**
として参照する。

- `id`: HVD で永続化される識別子 (number)
- `uuid`: React key 等 runtime identity 用 (string、HVD 非保存)
- `Layer` は `type` field による discriminated union で型安全に分岐

---

## 2. Zustand store の 3 分割

3 ヒエラルキー階層に **1:1 対応** する 3 store を持つ。

| store | 保持データ | 同期タイミング |
|---|---|---|
| `viewerDocumentStore` | 現在開いている document のメタ (title 等) | document load 時 |
| `slideStore`          | その document の `slides` 全件             | document load 時に viewerDocumentStore セットと連動 |
| `layerStore`          | **選択中** slide の `layers` のみ          | slide 選択/編集時に slideStore から自動切り出し |

実体は [src/state/](../src/state/) 配下:

- [src/state/viewerDocumentStore.ts](../src/state/viewerDocumentStore.ts)
- [src/state/slideStore.ts](../src/state/slideStore.ts)
- [src/state/layerStore.ts](../src/state/layerStore.ts)

### 2.1 なぜ 3 分割するか

最小構成なら `viewerDocumentStore` 1 つで slides / layers を含めて全保持で
済む。それでも **3 分割する理由**:

1. **編集パネルの購読範囲を狭める**: layerStore に「選択中 slide の layers
   のみ」を切り出すことで、edit pane の React FC は無関係な slide の
   layer 変更で再描画されない。
2. **役割の明確化**: 各 store の責務が階層に対応し、actions の意味が自明
   になる (例: `slideStore.addSlide` は document の slides を増やす、
   `layerStore.addLayer` は選択中 slide の layers を増やす)。
3. **段階的移行のしやすさ**: phase 単位で「この panel は layerStore を購読
   するだけ」と独立移行できる。

### 2.2 中間レイヤー禁止 (鉄則)

- `bridge/` / `useCase/` / `adapter` / `service` / 専用 `hooks/` 等の
  **中間層フォルダは一切作らない** (migration-roadmap-v2.md §0-2)。
- React FC は store を**直接** `useStore((s) => s.field)` で購読する。
- 副作用は store action 内または `useEffect` 内で完結させる。

---

## 3. データフロー

### 3.1 Load (storage → store)

```
File (.hvd / .hvz / .png)
  → SlideStorage.import / load / parseData
    → ViewerDocument (plain data, src/types)
      → viewerDocumentStore.setDocument(...)     // meta セット
      → slideStore.setSlides(doc.slides)         // 子 slides を同期
      // layerStore は selectedSlideIndex 連動で派生
```

`viewerDocumentStore.setDocument` (将来追加) は `slideStore.setSlides` も
**併せて呼ぶ** (orchestrator 不在のため store action 内で連鎖)。

### 3.2 Slide 選択 (slideStore → layerStore)

```
UI: slideStore.setSelectedIndex(newIndex)
  → slideStore.selectedIndex 更新
    → effect (どこか、e.g. EditPanel の useEffect):
        const slide = useSlideStore.getState().slides[newIndex];
        layerStore.setLayers(slide?.layers ?? []);
```

選択 index の変化に応じて layerStore の中身を「**選択中 slide の layers
のスナップショット**」に同期する。

### 3.3 Edit (UI → store → View 再描画)

```
UI イベント (例: layer drag)
  → layerStore.updateLayer(uuid, { transX: newX, transY: newY })
    → layerStore.layers 配列が新参照で置き換わる
      → 購読中の React FC (Mantine/Canvas 等) が再描画
      → 同時に: slideStore の対応 slide.layers を更新 (writeBack action)
        → slideStore.slides 配列も新参照で置き換わる
          → 他の購読 FC (Thumbnail 等) も再描画
```

**書き戻し (writeBack)** を必ず行うことで、source of truth を slideStore
側に保ち、layerStore を一時 view として扱う。

### 3.4 Save (store → storage)

```
UI: save ボタン
  → SlideStorage.save(buildViewerDocumentFromStores())
    // viewerDocumentStore + slideStore を合成して plain data を組み立て、
    // storage 側に渡す
  → modified フラグを viewerDocumentStore.setModified(false)
```

---

## 4. 設計上の鉄則 (再掲)

- **純粋データのみ store に格納**: Slide / Layer は class instance ではなく
  `src/types/` の type ベース。Object.is shallow equality で React の
  再描画判定が確実に動く。
- **mutation は store action 経由のみ**: 「読んだ object を直接書き換え」
  禁止 (immer 等を使う or new array/object を作る)。
- **storage は store を知らない**: SlideStorage は plain data の生成と
  parse のみを担当。store update は呼び出し側 (UI/Viewer/AppShell) が行う。
- **層は 4 つだけ**: `types/` / `state/` / `components/` / `utils/` (+ `model/`
  は当面残るが P5 以降で types に吸収して削除)。

---

## 5. 移行への含意

- P2 以降の view 置換は **store を直接購読する FC** として書く (props は
  最小限)。
- P5 で `model/` class の撤去と同時に store の Slide/Layer は
  `src/types/` 由来であることを保証する。
- 旧 EventDispatcher / PropertyEvent 経由の通知は **store の subscribe** に
  完全置換する。並走 (旧 + 新) は禁止。
