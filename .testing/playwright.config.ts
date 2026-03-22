import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  outputDir: './results',
  use: {
    baseURL: 'http://localhost:8000',
    headless: true,
    viewport: { width: 375, height: 812 }, // iPhone-sized for mobile-first testing
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx vite --port 8000',
    cwd: '../client',
    port: 8000,
    reuseExistingServer: true,
    timeout: 15_000,
  },
  retries: 0, // Set to 2 in CI
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
