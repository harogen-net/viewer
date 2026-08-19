// vite.config.js
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import path from 'path';
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// ビルド識別子。実機で「今動いているのが最新の版か」を判断できないと検証が成立しないため、
// ビルド時刻とコミットハッシュを埋め込む (PWA は SW がキャッシュを持つので特に必要)。
// git が引けない環境 (アーカイブから等) でも落ちないよう fallback する。
const gitSha = (() => {
	try {
		return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
	} catch {
		return "nogit";
	}
})();
// 例: "2026-08-19T07:12:33Z 1a2b3c4"。日時は UTC (端末のロケールに依存させない)。
const buildId = `${new Date().toISOString().replace(/\.\d+Z$/, "Z")} ${gitSha}`;

// 配信: GitHub Pages (プロジェクトページ https://harogen-net.github.io/viewer/) + PWA。
//   - base はリポジトリ名のサブパス "/viewer/"。asset / SW / manifest がこの配下に解決される。
//   - 旧 remove-crossorigin プラグイン (type="module" を剥がす) は撤去。ESM バンドルは module
//     として読む必要があり、剥がすと import.meta が構文エラーになり起動しない。
//   - manifest の start_url / icons はサブパス相対にする (絶対 "/..." は github.io ルートを指し壊れる)。
export default defineConfig({
	base: "/viewer/",
	define: {
		__BUILD_ID__: JSON.stringify(buildId),
	},
	build: {
		outDir: "dist",
	},
	plugins: [
		// React Fast Refresh (HMR): .tsx 編集をフルリロードせずコンポーネント単位で差し替え。
		// 先頭に置き、index.html に refresh プリアンブルを注入させる。
		react(),
		VitePWA({
			registerType: "autoUpdate",
			injectRegister: "auto",
			// public/nosleep.mp4 は iOS のスリープ抑止回避策 (useNoSleepVideo) が使う 1.5KB の
			// 無音動画。workbox の既定 globPatterns は mp4 を含まないため明示的に追加する
			// (precache に無いとオフライン時に取得できず、回避策が無言で失敗する)。
			// globPatterns を上書きするとプラグインが自前で追加する icon / manifest と
			// 二重登録になるため、includeAssets を使う。
			includeAssets: ["nosleep.mp4"],
			manifest: {
				name: "Viewer",
				short_name: "Viewer",
				theme_color: "#ffffff",
				background_color: "#ffffff",
				start_url: ".",
				display: "fullscreen",
				orientation: "landscape",
				lang: "ja",
				icons: [
					{
						src: "icon-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
				],
			},
		}),
	],
	resolve: {
		alias: { '@': path.resolve(__dirname, './src'), },
	}
});
