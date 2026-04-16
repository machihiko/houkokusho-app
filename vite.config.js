import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // ビルド成果物のうちキャッシュ対象を指定
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: '現場報告システム V5',
        short_name: '現場報告',
        description: '現場からの報告書作成・提出アプリ',
        background_color: '#ffffff',
        theme_color: '#3b82f6',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // アイコンが用意できた際は public/icons/ に配置する
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // アプリシェル（JS/CSS/HTML）をプリキャッシュ
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // ナビゲーションリクエストはすべて index.html へフォールバック（SPA対応）
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // ランタイムキャッシュ: 外部フォント等
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      // アイコン画像がなくてもビルドエラーにしない
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
