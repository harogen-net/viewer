// vite.config.js
import inject from "@rollup/plugin-inject";
import react from "@vitejs/plugin-react";
import path from 'path';
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// 配信: GitHub Pages (プロジェクトページ https://harogen-net.github.io/viewer/) + PWA。
//   - base はリポジトリ名のサブパス "/viewer/"。asset / SW / manifest がこの配下に解決される。
//   - 旧 remove-crossorigin プラグイン (type="module" を剥がす) は撤去。ESM バンドルは module
//     として読む必要があり、剥がすと import.meta が構文エラーになり起動しない。
//   - manifest の start_url / icons はサブパス相対にする (絶対 "/..." は github.io ルートを指し壊れる)。
export default defineConfig({
	base: "/viewer/",
	build: {
		outDir: "dist",
	},
	plugins: [
		// React Fast Refresh (HMR): .tsx 編集をフルリロードせずコンポーネント単位で差し替え。
		// 先頭に置き、index.html に refresh プリアンブルを注入させる。
		react(),
		inject({
			$: "jquery",
			jQuery: "jquery",
		}),
		VitePWA({
			registerType: "autoUpdate",
			injectRegister: "auto",
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
