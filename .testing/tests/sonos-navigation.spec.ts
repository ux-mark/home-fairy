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

// ── Test (a): Sonos page loads with 3 tabs visible ────────────────────────────

test('Sonos page loads with 3 tabs visible', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'SonosNav-smoke')

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  const tablist = page.getByRole('tablist', { name: 'Sonos sections' })
  await expect(tablist).toBeVisible()

  const nowPlayingTab = page.getByRole('tab', { name: 'Now Playing' })
  const browseTab = page.getByRole('tab', { name: 'Browse' })
  const favouritesTab = page.getByRole('tab', { name: 'Favourites' })

  await expect(nowPlayingTab).toBeVisible()
  await expect(browseTab).toBeVisible()
  await expect(favouritesTab).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-nav-01-three-tabs.png', fullPage: true })
})

// ── Test (b): Each tab can be clicked and switches content ────────────────────

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

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  // Scope to the bottom nav tablist to avoid ambiguity with Browse's source tabs
  const sonosNav = page.getByRole('tablist', { name: 'Sonos sections' })
  const nowPlayingTab = sonosNav.getByRole('tab', { name: 'Now Playing' })
  const browseTab = sonosNav.getByRole('tab', { name: 'Browse' })
  const favouritesTab = sonosNav.getByRole('tab', { name: 'Favourites' })

  // Switch to Browse
  await browseTab.click()
  // Browse panel should show its search input
  await expect(page.getByLabel('Search music')).toBeVisible()

  // Switch to Favourites — scope to Sonos nav to avoid Browse source "Favourites" tab
  await favouritesTab.click()
  // Favourites empty state visible (we mocked empty array)
  await expect(page.getByRole('heading', { name: 'No favourites yet' })).toBeVisible()

  // Switch back to Now Playing
  await nowPlayingTab.click()
  // Nothing playing heading visible (stopped state)
  await expect(page.getByRole('heading', { name: 'Nothing playing' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-nav-02-tab-switching.png', fullPage: true })
})

// ── Test (c): Active tab has aria-selected=true ───────────────────────────────

test('Active Sonos tab has aria-selected true', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'SonosNav-aria-selected')

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  // Scope to the bottom nav tablist to avoid ambiguity with Browse's source tabs
  const sonosNav = page.getByRole('tablist', { name: 'Sonos sections' })
  const nowPlayingTab = sonosNav.getByRole('tab', { name: 'Now Playing' })
  const browseTab = sonosNav.getByRole('tab', { name: 'Browse' })
  const favouritesTab = sonosNav.getByRole('tab', { name: 'Favourites' })

  // Now Playing is the default active tab
  await expect(nowPlayingTab).toHaveAttribute('aria-selected', 'true')

  // Click Browse — it becomes active
  await browseTab.click()
  await expect(browseTab).toHaveAttribute('aria-selected', 'true')

  // Click Favourites — it becomes active (scoped to Sonos nav, not Browse source tabs)
  await favouritesTab.click()
  await expect(favouritesTab).toHaveAttribute('aria-selected', 'true')

  await page.screenshot({ path: '.testing/results/sonos-nav-03-aria-selected.png', fullPage: true })
})

// ── Test (d): Non-active tabs have aria-selected=false ───────────────────────

test('Non-active Sonos tabs have aria-selected false', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'SonosNav-aria-not-selected')

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  // Scope to the bottom nav tablist to avoid ambiguity with Browse's source tabs
  const sonosNav = page.getByRole('tablist', { name: 'Sonos sections' })
  const browseTab = sonosNav.getByRole('tab', { name: 'Browse' })
  const favouritesTab = sonosNav.getByRole('tab', { name: 'Favourites' })

  // Browse and Favourites are not active on load
  await expect(browseTab).toHaveAttribute('aria-selected', 'false')
  await expect(favouritesTab).toHaveAttribute('aria-selected', 'false')

  // After clicking Browse, Now Playing and Favourites are still inactive
  await browseTab.click()
  const nowPlayingTab = sonosNav.getByRole('tab', { name: 'Now Playing' })
  await expect(nowPlayingTab).toHaveAttribute('aria-selected', 'false')
  await expect(favouritesTab).toHaveAttribute('aria-selected', 'false')

  await page.screenshot({ path: '.testing/results/sonos-nav-04-aria-not-selected.png', fullPage: true })
})
