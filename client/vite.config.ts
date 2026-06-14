import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Only precache the HTML entry and CSS — JS chunks use runtime caching
        // to avoid preload warnings for lazy-loaded modules
        globPatterns: ['**/*.{css,ico,png,svg,webmanifest}', 'index.html'],
        // Don't serve index.html for /api/ requests or socket.io upgrades —
        // both must pass through to the server (the latter for the websocket
        // upgrade to succeed in Safari).
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
        // Old hashed chunks become stale immediately after a deploy; without
        // this, every old js-chunks entry sticks around in the cache forever.
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.js$/,
            // CacheFirst because chunk URLs are content-hashed and immutable —
            // a given chunk filename cannot semantically change. The previous
            // StaleWhileRevalidate caused the SW's controllerchange handler in
            // main.tsx to force a reload after every deploy, since SWR served
            // the old chunk to the running tab while fetching the new one.
            handler: 'CacheFirst',
            options: {
              cacheName: 'js-chunks',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
          {
            urlPattern: /\/api\/sonos\/art-proxy\?/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'album-art-cache',
              expiration: {
                maxEntries: 5000,
                maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Home Fairy',
        short_name: 'Home Fairy',
        theme_color: '#10b981',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: '/fairy-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/fairy-icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  build: {
    modulePreload: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '0.0.0.0',
    port: 8000,
    allowedHosts: ['home.thefairies.ie'],
    proxy: {
      // VITE_API_PROXY exists for the Playwright suite, which points it at a
      // dead port so unmocked API calls fail fast instead of reaching the
      // live production server. Dev keeps the :3001 default.
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: process.env.VITE_API_PROXY ?? 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
})
