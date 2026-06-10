import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  outputDir: './results',
  use: {
    // Dedicated test port. This used to be 3001 with reuseExistingServer —
    // production home-fairy holds 3001 on the Pi, so the suite silently ran
    // against the live server instead of the branch under test.
    baseURL: 'http://localhost:8100',
    headless: true,
    viewport: { width: 375, height: 812 }, // iPhone-sized for mobile-first testing
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx vite --port 8100',
    cwd: '../client',
    port: 8100,
    reuseExistingServer: true,
    timeout: 60_000,
    // Unmocked API calls must never reach the live server: point the vite
    // proxy at a dead port so they fail fast instead. Tests mock everything
    // they need via page.route, which intercepts before the network.
    env: { VITE_API_PROXY: 'http://127.0.0.1:1' },
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
