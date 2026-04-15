import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

// Collect console errors across all tests
const consoleErrors: { page: string; message: string }[] = []

// Mock better-auth session so AuthGuard does not redirect to /login
async function mockSession(page: Page) {
  await page.route('**/api/auth/get-session', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: { id: 'test-session', userId: 'test-user', expiresAt: '2099-01-01T00:00:00.000Z' },
        user: { id: 'test-user', name: 'Test User', email: 'test@example.com', role: 'admin' },
      }),
    }),
  )
}

function collectConsoleErrors(page: Page, pageName: string) {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (
        text.includes('favicon') ||
        text.includes('404') ||
        text.includes('Failed to load resource') ||
        text.includes('net::ERR_')
      ) return
      consoleErrors.push({ page: pageName, message: text })
    }
  })
}

// ── Shared mock payloads ──────────────────────────────────────────────────────

const SPOTIFY_DISCONNECTED = { connected: false }
const SPOTIFY_CONNECTED = { connected: true, display_name: 'testuser' }

// ── Shared API mocks needed for the Settings page to load cleanly ─────────────

async function mockSettingsApis(page: Page, spotifyPayload: object) {
  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(spotifyPayload) }),
  )
  // Prevent unrelated API calls from failing loudly
  await page.route('**/api/sonos/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true }) }),
  )
}

// ── Test (a): Settings Music section shows "Connect Spotify" link when disconnected

test('Settings Music section shows Connect Spotify link when Spotify is disconnected', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Spotify-smoke')

  await mockSession(page)

  await mockSettingsApis(page, SPOTIFY_DISCONNECTED)

  await page.goto('/settings')
  await page.waitForLoadState('networkidle')

  // The Spotify section heading
  await expect(page.getByRole('heading', { name: 'Spotify' })).toBeVisible()

  // Connect Spotify link should be visible
  const connectLink = page.getByRole('link', { name: 'Connect Spotify' })
  await expect(connectLink).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-spotify-01-disconnected.png', fullPage: true })
})

// ── Test (b): Connect Spotify link href is "/api/spotify/auth" ───────────────

test('Connect Spotify link points to /api/spotify/auth', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Spotify-link-href')

  await mockSession(page)

  await mockSettingsApis(page, SPOTIFY_DISCONNECTED)

  await page.goto('/settings')
  await page.waitForLoadState('networkidle')

  const connectLink = page.getByRole('link', { name: 'Connect Spotify' })
  await expect(connectLink).toHaveAttribute('href', '/api/spotify/auth')

  await page.screenshot({ path: '.testing/results/sonos-spotify-02-link-href.png', fullPage: true })
})

// ── Test (c): Connected state shows username and Disconnect button ─────────────

test('Settings Music section shows connected username and Disconnect button when Spotify is connected', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Spotify-connected')

  await mockSession(page)

  await mockSettingsApis(page, SPOTIFY_CONNECTED)

  await page.goto('/settings')
  await page.waitForLoadState('networkidle')

  // Should show "Connected as testuser"
  await expect(page.getByText(/Connected as testuser/i)).toBeVisible()

  // Disconnect button should be present
  await expect(page.getByRole('button', { name: 'Disconnect Spotify' })).toBeVisible()

  // When connected, a "Reconnect Spotify" link is shown (not "Connect Spotify")
  await expect(page.getByRole('link', { name: 'Reconnect Spotify' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-spotify-03-connected.png', fullPage: true })
})

// ── Test (d): ?spotify=connected query param — page loads without crash ────────

test('Settings page with ?spotify=connected query param loads without crashing', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Spotify-oauth-redirect')

  await mockSession(page)

  await mockSettingsApis(page, SPOTIFY_CONNECTED)

  // Simulate the OAuth redirect back to settings with the spotify=connected param
  await page.goto('/settings?spotify=connected')
  await page.waitForLoadState('networkidle')

  // Page should load and show Settings heading without crashing
  await expect(page.getByRole('heading', { name: 'Settings' }).first()).toBeVisible()

  // Connected state (since we mocked connected) should be shown
  await expect(page.getByText(/Connected as testuser/i)).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-spotify-04-oauth-redirect.png', fullPage: true })
})
