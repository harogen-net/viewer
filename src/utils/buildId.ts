// ビルド識別子 (ビルド時刻 UTC + コミットハッシュ)。
//
// 実機検証で「今動いているのが最新の版か」を判断するために使う。PWA は Service Worker が
// アプリ本体をキャッシュするため、デプロイしても端末側が古い版を動かしていることがあり、
// 目印が無いと検証結果を信用できない (実際に「デプロイ済みか」を取り違えた)。
//
// 値は vite.config.js の define で埋め込む。vitest には define が無いため、
// 未定義でも落ちないように包む (テストや dev では "dev" になる)。

declare const __BUILD_ID__: string;

export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
