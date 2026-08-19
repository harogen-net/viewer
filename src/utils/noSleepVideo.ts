// 無音動画の再生によるスリープ抑止 (NoSleep.js 方式) の本体。
//
// Screen Wake Lock が効かない iOS 向けの回避策。React の hook (useNoSleepVideo) からではなく
// モジュールスコープで要素を持つ理由:
//
//   iOS で **ミュートしていない** メディアを再生するには、`play()` がユーザー操作の
//   コールスタック内で呼ばれる必要がある。React の effect は操作の後 (描画後) に走るため、
//   effect から呼ぶと自動再生ポリシーで拒否される。そのため「スライドショー開始ボタンの
//   onClick から直接 prime() を呼ぶ」経路を用意する。
//
// なぜミュートしないのか:
//   iOS 17 では「完全にミュートされた動画はスリープ抑止の対象外」という挙動が報告されている。
//   そこで音声トラック (無音) を持つ動画を muted=false で再生し、
//   「音声付きメディアを再生中」と認識させることを狙う。
//
//   代償: iOS のオーディオセッションを奪うため、**ユーザーが裏で再生している音楽や
//   ポッドキャストを止める**。音声トラックは無音なので音は出ないが、この副作用は残る。
//
//   なお `video.volume` は iOS では変更できない (無視される)。音が出ないことは
//   「トラック自体が無音」であることだけで担保している。

/** 末尾のこの秒数手前まで来たら先頭付近へ戻す (末尾に到達させないため)。 */
const SEEK_MARGIN_SEC = 0.5;
/** duration が取れないときに巻き戻す閾値 (秒)。 */
const SEEK_FALLBACK_AFTER_SEC = 1;

let video: HTMLVideoElement | null = null;

/**
 * 配信 base ("/viewer/") 配下の動画パス。`import.meta.env.BASE_URL` はこの tsconfig では
 * 型が付かないため document.baseURI から解決する。
 */
const videoSrc = (): string => new URL("nosleep.mp4", document.baseURI).href;

const onTimeUpdate = (): void => {
	if (!video) return;
	const { currentTime, duration } = video;
	const limit = Number.isFinite(duration) ? duration - SEEK_MARGIN_SEC : SEEK_FALLBACK_AFTER_SEC;
	if (currentTime <= limit) return;
	// 末尾に到達させない。loop での折り返しは「一旦再生が終わった」扱いになり抑止が切れる
	// 余地があるため (参照実装も 1 秒超の mp4 では loop を使わない)。
	// 戻す位置をランダムにするのも参照実装と同じ (同一フレームでの停止と見なされないため)。
	video.currentTime = Math.random() * SEEK_MARGIN_SEC;
};

const createElement = (): HTMLVideoElement => {
	const el = document.createElement("video");
	el.src = videoSrc();
	// ミュートしない (上記の理由)。音声トラックは無音なので音は出ない。
	el.muted = false;
	el.defaultMuted = false;
	// iOS では無視されるが、他プラットフォームでの保険として最小音量にしておく。
	el.volume = 0.001;
	el.playsInline = true;
	el.setAttribute("playsinline", "");
	el.setAttribute("aria-hidden", "true");
	el.dataset.nosleep = "";
	// 隠し方に透明度・遮蔽・display を使わない。いずれも「描画省略 = 再生していない」と
	// 見なされる余地がある。不透明・最前面のまま 2px に留める。動画は黒一色で、これが動くのは
	// スライドショー表示中 (オーバーレイ背景は常に #000) だけなので黒地に黒で実質見えない。
	Object.assign(el.style, {
		position: "fixed",
		top: "0",
		left: "0",
		width: "2px",
		height: "2px",
		// スライドショーのオーバーレイ (9999) とその UI (10000) より上。
		zIndex: "10001",
		pointerEvents: "none",
	} satisfies Partial<CSSStyleDeclaration>);
	el.addEventListener("timeupdate", onTimeUpdate);
	return el;
};

/**
 * 再生を開始する。**ユーザー操作のコールスタック内から呼ぶこと** (iOS の自動再生ポリシー)。
 * 既に再生中なら何もしない。冪等。
 */
export const primeNoSleepVideo = (): void => {
	if (typeof document === "undefined") return;
	if (!video) {
		video = createElement();
		document.body.appendChild(video);
	}
	const p = video.play() as Promise<void> | undefined;
	p?.catch(() => {
		// 自動再生ポリシーで拒否された。呼び出し側 (useNoSleepVideo) が次のユーザー操作で
		// 再試行する。抑止できないだけで機能自体は継続する。
	});
};

/** 停止して要素を取り除く。冪等。 */
export const stopNoSleepVideo = (): void => {
	if (!video) return;
	const el = video;
	video = null;
	el.removeEventListener("timeupdate", onTimeUpdate);
	el.pause();
	// src を空にしてからデタッチする。残しておくとデコーダを掴んだままになる実装がある。
	el.removeAttribute("src");
	el.load();
	el.remove();
};
