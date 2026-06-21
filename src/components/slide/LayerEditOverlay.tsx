import type { CSSProperties, FC } from "react";
import { useLayoutEffect, useState } from "react";
import { useLayerStore } from "../../state/layerStore";
import type { Slide } from "../../types/Slide";

// 編集 canvas の選択 layer 装飾 overlay (v4 Group D D-3a)。
// レガシー src/view/layer/AdjustView.ts (jQuery 293 行) は import せず新規実装 (§0-10)。
//
// 役割 (D-3a スコープ):
//   - useLayerStore.selectedLayer に対応する slide layer の bbox を計測
//   - SlideView と同一の slide-coord 空間で transform を再現した選択枠を描画
//
// 後の chunk:
//   - D-3b: 枠本体 mousedown で drag (transX/transY 更新)
//   - D-3c: 4 隅 anchor で resize、上部 anchor で rotate
//
// bbox 計測:
//   - LayerView wrapper (`[data-layer-id="${id}"]`) を stageRoot から querySelector
//   - wrapper.offsetWidth/Height = transform 適用前の content intrinsic size
//   - ResizeObserver で content size 変化に追従 (image load 後の natural size 更新等)
//
// 枠の transform / サイズ:
//   - layer 自身の scale (scaleX/Y, mirrorH/V) を frame の transform には適用せず、
//     frame の width/height = contentW * |sx|, contentH * |sy| として visual size を展開する
//     (こうすることで、表示上のボーダー線幅が layer の scale に影響されず一定になる)。
//   - transform-origin: 50% 50% (legacy AdjustView と同 pivot、コンテンツ中心)
//   - layer wrapper の visual center に frame center を合わせるため translate にオフセット補正を入れる:
//       visW = contentW * |sx|, dx = (contentW - visW) / 2
//       (sx=1 で dx=0、sx=2 で dx=-contentW/2 = 左に半分ずれて、最終的に visual center が一致)。
//   - rotate のみ frame にも適用 (回転後の bbox を反映)
//
// 線の太さ補正:
//   - SlideEditView の親で stage 全体が `scale(stageScale)` されているため、
//     1px の outline は描画上 stageScale px となり小縮尺では視認不可。
//   - outline 太さを (2 / stageScale) で補正し常時 2px 視認可とする。
//   - layer 自身の scale は frame transform に適用していないので outline 補正は stageScale のみで十分。

interface LayerEditOverlayProps {
  slide: Slide;
  /** SlideEditView の stage 全体 scale (border 太さ補正に使用)。 */
  stageScale: number;
  /** layer wrapper を querySelector する起点要素。SlideView root を渡す。 */
  stageRoot: HTMLElement | null;
}

const overlayWrapStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

export const LayerEditOverlay: FC<LayerEditOverlayProps> = ({
  slide,
  stageScale,
  stageRoot,
}) => {
  const selectedLayer = useLayerStore((s) => s.selectedLayer);
  // 計測値に uuid を紐付け、現選択 layer と一致しない間1 frame は描画をスキップする
  // (これがないと selectedLayer 変更後の初回 render で 「旧 size + 新 transform」 の枠が
  //  1 フレーム描画されてアウトラインがちらつく)。
  const [measured, setMeasured] = useState<{
    uuid: string;
    w: number;
    h: number;
  } | null>(null);

  // 選択 layer の content size 計測。
  // useLayoutEffect: browser paint 前に同期実行されるため、click → 検出 → 計測 → 描画 が
  // 1 フレーム内に収まり、選択枠のチラツきが出ない。
  useLayoutEffect(() => {
    if (!selectedLayer || !stageRoot) {
      setMeasured(null);
      return;
    }
    // 別 slide の選択 layer (slide 切替直後等) はスキップ
    if (!slide.layers.some((l) => l.uuid === selectedLayer.uuid)) {
      setMeasured(null);
      return;
    }
    const wrapper = stageRoot.querySelector<HTMLElement>(
      `[data-layer-id="${selectedLayer.id}"]`,
    );
    if (!wrapper) {
      setMeasured(null);
      return;
    }
    const uuid = selectedLayer.uuid;
    const measure = () => {
      setMeasured({ uuid, w: wrapper.offsetWidth, h: wrapper.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapper);
    // img 内の load 後のサイズ確定にも追従 (resize observer は box サイズ変化を検知)
    return () => ro.disconnect();
  }, [selectedLayer, slide, stageRoot]);

  // 計測値の uuid が現選択と不一致 (増分 render 間のステール) なら描画しない
  const validMeasured =
    selectedLayer && measured && measured.uuid === selectedLayer.uuid
      ? measured
      : null;

  // 選択無し or 計測未確定時は overlay コンテナだけ出す (test の存在判定で使用)
  if (!selectedLayer || !validMeasured) {
    return <div style={overlayWrapStyle} data-edit-overlay />;
  }

  const absSx = Math.abs(selectedLayer.scaleX);
  const absSy = Math.abs(selectedLayer.scaleY);
  // visual size: layer の scale を展開して frame の幅高に反映
  const visW = validMeasured.w * absSx;
  const visH = validMeasured.h * absSy;
  // visual center を layer wrapper の visual center に合わせるためのオフセット
  const dx = (validMeasured.w - visW) / 2;
  const dy = (validMeasured.h - visH) / 2;
  // transform: translate (visual center 合わせ) → rotate のみ。scale は適用しない
  // (mirrorH/V も visual size には |sx|/|sy| として反映済み、frame に符号反転は不要)。
  const transform = `translate(${selectedLayer.transX + dx}px, ${selectedLayer.transY + dy}px) rotate(${selectedLayer.rotation}deg)`;
  const outlineThickness = 10;
  const outlinePx =
    stageScale > 0
      ? Math.max(outlineThickness / stageScale, 1)
      : outlineThickness;

  const frameStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: visW,
    height: visH,
    transform,
    transformOrigin: "50% 50%",
    outline: `${outlinePx}px solid rgba(255, 0, 0, 0.5)`,
    outlineOffset: 0,
    boxSizing: "border-box",
    pointerEvents: "none",
  };

  return (
    <div style={overlayWrapStyle} data-edit-overlay>
      <div
        style={frameStyle}
        data-edit-selection-frame
        data-selected-layer-id={selectedLayer.id}
        data-selected-layer-uuid={selectedLayer.uuid}
      />
    </div>
  );
};
