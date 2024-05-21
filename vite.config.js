// vite.config.js
import { defineConfig } from "vite";
import inject from "@rollup/plugin-inject";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist", // ビルドの出力ディレクトリ
  },
  plugins: [
    inject({
      $: "jquery",
      jQuery: "jquery",
    }),
  ],
});
