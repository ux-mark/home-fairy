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
        // Don't serve index.html for /api/ requests — let them through to the server
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.js$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'js-chunks' },
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
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
})
