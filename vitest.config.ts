import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// src の `@/` エイリアスを vite.config.js と揃える (これが無いとテストが import 解決に失敗する)。
	// import.meta は tsconfig の module:es2015 で型エラーになるため __dirname を使う (vite.config.js と同形)。
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./tests/setup.ts"],
		include: ["tests/**/*.test.{ts,tsx}"],
	},
});
