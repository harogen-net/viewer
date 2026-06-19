import { createElement, createRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import {
    SlideshowShell,
    type SlideShowRuntimeHandle,
    type SlideshowShellProps,
} from "./SlideshowShell";

/**
 * R4 (bullet 4): `SlideshowShell` FC を bootstrap レベルでマウントするためのヘルパ。
 *
 * `createRoot + flushSync` は React lifecycle 外（`bootstrapViewer` 内）でのみ呼び出され、
 * 外部 (`SlideshowUseCase`) からは旧 `SlideShowRuntime` と同じ命令的 handle 経由で利用される。
 */

export type SlideshowShellMount = {
	handle: SlideShowRuntimeHandle;
	host: HTMLElement;
	root: Root;
	unmount: () => void;
};

export type MountSlideshowShellOptions = Pick<SlideshowShellProps, "onPlaybackChanged">;

export function mountSlideshowShell(
	host: HTMLElement,
	options: MountSlideshowShellOptions = {}
): SlideshowShellMount {
	const ref = createRef<SlideShowRuntimeHandle>();
	const root = createRoot(host);
	flushSync(() => {
		root.render(
			createElement(SlideshowShell, {
				ref,
				onPlaybackChanged: options.onPlaybackChanged,
			})
		);
	});
	const handle = ref.current;
	if (!handle) {
		throw new Error("mountSlideshowShell: SlideshowShell handle was not attached.");
	}
	return {
		handle,
		host,
		root,
		unmount: () => {
			root.unmount();
		},
	};
}
