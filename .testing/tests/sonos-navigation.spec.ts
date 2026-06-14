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

// Shared stopped-state mock used by several tests in this file
const STOPPED_NOW_PLAYING = [
  {
    roomName: 'Living Room',
    speakerName: 'Living Room',
    state: {
      playbackState: 'STOPPED',
      currentTrack: { artist: '', title: '', album: '', albumArtUri: '', type: 'track' },
      volume: 30,
      mute: false,
      trackNo: 0,
      elapsedTime: 0,
      duration: 0,
    },
    error: false,
  },
]

// ── Test (a): Sonos page loads with 3 nav links visible ──────────────────────

test('Sonos page loads with 3 tabs visible', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'SonosNav-smoke')

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  // Navigation uses NavLink elements (not a tablist) in the bottom nav
  const nav = page.locator('nav').filter({ has: page.getByRole('link', { name: 'Playing' }) })
  await expect(nav).toBeVisible()

  const playingLink = page.getByRole('link', { name: 'Playing' })
  const browseLink = page.getByRole('link', { name: 'Browse' })
  const favouritesLink = page.getByRole('link', { name: 'Favourites' })

  await expect(playingLink).toBeVisible()
  await expect(browseLink).toBeVisible()
  await expect(favouritesLink).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-nav-01-three-tabs.png', fullPage: true })
})

// ── Test (b): Each route shows different content ──────────────────────────────

test('Sonos tabs switch visible content when clicked', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'SonosNav-tab-switch')

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )

  // Navigate to Browse route — Browse panel should show its search input
  await page.goto('/sonos/browse')
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('Search music')).toBeVisible()

  // Navigate to Favourites route — Favourites empty state visible (we mocked empty array)
  await page.goto('/sonos/favourites')
  await page.waitForLoadState('networkidle')
  // "No favourites yet." is a paragraph (not a heading)
  await expect(page.getByText('No favourites yet.')).toBeVisible()

  // Navigate to Now Playing route — Nothing playing text visible (stopped state)
  await page.goto('/sonos/playing')
  await page.waitForLoadState('networkidle')
  // "Nothing playing" renders as a paragraph, not a heading
  await expect(page.getByText('Nothing playing')).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-nav-02-tab-switching.png', fullPage: true })
})

// ── Test (c): Active nav link has aria-current=page ──────────────────────────

test('Active Sonos tab has aria-selected true', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'SonosNav-aria-selected')

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )

  // At /sonos/playing, the "Playing" link should be aria-current=page
  await page.goto('/sonos/playing')
  await page.waitForLoadState('networkidle')
  const playingLink = page.getByRole('link', { name: 'Playing' })
  await expect(playingLink).toHaveAttribute('aria-current', 'page')

  // At /sonos/browse, the "Browse" link should be aria-current=page
  await page.goto('/sonos/browse')
  await page.waitForLoadState('networkidle')
  const browseLink = page.getByRole('link', { name: 'Browse' })
  await expect(browseLink).toHaveAttribute('aria-current', 'page')

  // At /sonos/favourites, the "Favourites" link should be aria-current=page
  await page.goto('/sonos/favourites')
  await page.waitForLoadState('networkidle')
  const favouritesLink = page.getByRole('link', { name: 'Favourites' })
  await expect(favouritesLink).toHaveAttribute('aria-current', 'page')

  await page.screenshot({ path: '.testing/results/sonos-nav-03-aria-selected.png', fullPage: true })
})

// ── Test (d): Non-active nav links do NOT have aria-current=page ─────────────

test('Non-active Sonos tabs have aria-selected false', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'SonosNav-aria-not-selected')

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )

  // At /sonos/playing, Browse and Favourites links should NOT be aria-current=page
  await page.goto('/sonos/playing')
  await page.waitForLoadState('networkidle')

  const browseLink = page.getByRole('link', { name: 'Browse' })
  const favouritesLink = page.getByRole('link', { name: 'Favourites' })

  await expect(browseLink).not.toHaveAttribute('aria-current', 'page')
  await expect(favouritesLink).not.toHaveAttribute('aria-current', 'page')

  // At /sonos/browse, Playing and Favourites links should NOT be aria-current=page
  await page.goto('/sonos/browse')
  await page.waitForLoadState('networkidle')

  const playingLink = page.getByRole('link', { name: 'Playing' })
  const favouritesLink2 = page.getByRole('link', { name: 'Favourites' })
  await expect(playingLink).not.toHaveAttribute('aria-current', 'page')
  await expect(favouritesLink2).not.toHaveAttribute('aria-current', 'page')

  await page.screenshot({ path: '.testing/results/sonos-nav-04-aria-not-selected.png', fullPage: true })
})
