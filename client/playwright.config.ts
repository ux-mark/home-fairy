import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:8000',
    headless: true,
    viewport: { width: 375, height: 812 }, // iPhone-sized for mobile-first testing
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --port 8000',
    port: 8000,
    reuseExistingServer: true,
    timeout: 15_000,
  },
  projects: [
    {
      name: 'Mobile',
      use: { viewport: { width: 375, height: 812 } },
    },
    {
      name: 'Desktop',
      use: { viewport: { width: 1280, height: 720 } },
    },
  ],
})
