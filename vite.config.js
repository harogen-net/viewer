// vite.config.js
import inject from "@rollup/plugin-inject";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	base: "./",
	build: {
		outDir: "dist", // ビルドの出力ディレクトリ
	},
	plugins: [
		VitePWA({
			injectRegister: "auto",
			manifest: {
				name: "Viewer",
				short_name: "Viewer",
				theme_color: "#ffffff",
				background_color: "#ffffff",
				start_url: "/",
				display: "fullscreen",
				orientation: "landscape",
				lang: "ja",
				icons: [
					{
						src: "/icon-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
				],
			},
		}),
		inject({
			$: "jquery",
			jQuery: "jquery",
		}),
		{
			name: "remove-crossorigin",
			transformIndexHtml(html) {
				return html.replaceAll("crossorigin ", "");
			},
		},
	],
});
