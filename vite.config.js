import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import inject from '@rollup/plugin-inject';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  plugins: [
    react(),
    VitePWA({
      injectRegister: 'auto',
      manifest: {
        name: 'Viewer',
        short_name: 'Viewer',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        start_url: '/',
        display: 'fullscreen',
        orientation: 'landscape',
        lang: 'ja',
        icons: [
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
    inject({
      $: 'jquery',
      jQuery: 'jquery',
    }),
  ],
});