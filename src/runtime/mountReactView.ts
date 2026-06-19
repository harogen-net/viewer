import { createElement, createRef, type FunctionComponent, type Ref } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { createSlide, type Slide } from "../model/Slide";
import {
    DOMSlideView,
    EditableSlideView,
    type DOMSlideViewHandle,
    type EditableSlideViewHandle,
} from "../view/slide";

/**
 * R4.7.1: 旧 Runtime クラスが内部で抱えていた `createRoot + flushSync + render` を
 * 集約するヘルパ群。Runtime 本体から React の細部を切り離し、後続で hook / FC
 * 化する際の差し替え地点をひとつにまとめる目的のモジュール。
 */

export type ReactViewMount<H> = {
	handle: H;
	host: HTMLElement;
	root: Root;
	unmount: () => void;
};

const EditableSlideViewForRender = EditableSlideView as unknown as FunctionComponent<{
	ref: Ref<EditableSlideViewHandle>;
	slide: Slide;
	onImageDropped?: (imageId: string) => void;
}>;

const DOMSlideViewForRender = DOMSlideView as unknown as FunctionComponent<{
	ref: Ref<DOMSlideViewHandle>;
	slide: Slide;
}>;

/**
 * `parent` に新規 div を挿入し、その上に `<EditableSlideView>` をマウントする。
 * 返却 mount は `unmount()` で root unmount + host 除去をまとめて実行する。
 */
export function mountEditableSlideViewInto(
	parent: HTMLElement,
	onImageDropped?: (imageId: string) => void
): ReactViewMount<EditableSlideViewHandle> {
	const host = document.createElement("div");
	host.style.width = "100%";
	host.style.height = "100%";
	parent.appendChild(host);
	const ref = createRef<EditableSlideViewHandle>();
	const root = createRoot(host);
	flushSync(() => {
		root.render(
			createElement(EditableSlideViewForRender, {
				ref,
				slide: createSlide(),
				onImageDropped,
			})
		);
	});
	return {
		handle: ref.current as EditableSlideViewHandle,
		host,
		root,
		unmount: () => {
			root.unmount();
			host.remove();
		},
	};
}

/**
 * `parent` に新規 div を挿入し、その上に `<DOMSlideView>` をマウントする。
 * SlideShowRuntime のスライド生成（slide ごとに root を作る命令的設計）の経過点。
 */
export function mountDOMSlideViewInto(
	parent: HTMLElement,
	slide: Slide
): ReactViewMount<DOMSlideViewHandle> {
	const host = document.createElement("div");
	parent.appendChild(host);
	const ref = createRef<DOMSlideViewHandle>();
	const root = createRoot(host);
	flushSync(() => {
		root.render(createElement(DOMSlideViewForRender, { ref, slide }));
	});
	return {
		handle: ref.current as DOMSlideViewHandle,
		host,
		root,
		unmount: () => {
			root.unmount();
			host.remove();
		},
	};
}
