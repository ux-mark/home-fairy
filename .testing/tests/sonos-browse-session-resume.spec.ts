import { test, expect, type Page } from '@playwright/test'

// ─────────────────────────────────────────────────────────────────────────────
// Tests for item-080: Browse navigation preserves the user's position
// within a session when they leave and return via the Browse nav link or the
// "Change music" / "Browse music" buttons on speaker cards.
// Run serially so the Vite build/dev-server interactions are deterministic.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

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

async function mockBrowseBackends(page: Page) {
  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: false }) }),
  )
  await page.route('**/api/sonos/library/genres', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
}

// Two NavLinks render (desktop sidebar + mobile bottom nav) but only one is
// visible at each viewport. Scope to a currently-visible <nav> and select the
// matching link inside it.
function visibleLink(page: Page, name: string) {
  return page
    .locator('nav')
    .filter({ has: page.getByRole('link', { name }) })
    .filter({ visible: true })
    .getByRole('link', { name })
}

// ── Source filter resume ─────────────────────────────────────────────────────

test('Clicking Browse after leaving resumes the same source filter', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  await page.goto('/sonos/browse')
  await expect(page.getByLabel('Search music')).toBeVisible()

  const nasTab = page.getByRole('tab', { name: 'NAS' })
  await nasTab.click()
  await expect(nasTab).toHaveAttribute('aria-selected', 'true')

  // Leave Browse for the Playing page (PUSH navigation)
  await visibleLink(page, 'Playing').click()
  await page.waitForURL('**/sonos/playing')

  // Return via the Browse nav link — the NAS tab should still be selected
  await visibleLink(page, 'Browse').click()
  await page.waitForURL('**/sonos/browse**')

  await expect(page.getByRole('tab', { name: 'NAS' })).toHaveAttribute('aria-selected', 'true')
})

// ── Search query resume ──────────────────────────────────────────────────────

test('Clicking Browse after leaving resumes the active search query', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  await page.goto('/sonos/browse')
  await expect(page.getByLabel('Search music')).toBeVisible()

  const searchInput = page.getByLabel('Search music')
  await searchInput.fill('mumford')
  await expect(searchInput).toHaveValue('mumford')

  await visibleLink(page, 'Playing').click()
  await page.waitForURL('**/sonos/playing')

  await visibleLink(page, 'Browse').click()
  await page.waitForURL('**/sonos/browse**')

  await expect(page.getByLabel('Search music')).toHaveValue('mumford')
})

// ── Deep path resume ─────────────────────────────────────────────────────────

test('Clicking Browse resumes the deepest visited browse URL', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  // Mock the Spotify playlist endpoint so the deep page renders something valid
  await page.route('**/api/spotify/playlists/abc123', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'abc123',
        name: 'Sunday Chill',
        images: [],
        tracks: { items: [] },
      }),
    }),
  )

  // Simulate the user having drilled into a playlist in this session
  await page.goto('/sonos/browse/spotify/playlist/abc123')
  // Wait for layout (nav links) so the tracking effect has definitely run
  await expect(visibleLink(page, 'Browse')).toBeVisible()
  // Wait for the tracking effect to have persisted the deep path
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem('sonos:lastBrowsePath')),
    )
    .toBe('/sonos/browse/spotify/playlist/abc123')

  // Leave for Now Playing, then tap Browse
  await visibleLink(page, 'Playing').click()
  await page.waitForURL('**/sonos/playing')

  // Sanity-check: saved path is still intact
  const stored = await page.evaluate(() =>
    sessionStorage.getItem('sonos:lastBrowsePath'),
  )
  expect(stored).toBe('/sonos/browse/spotify/playlist/abc123')

  await visibleLink(page, 'Browse').click()

  // We should land back inside the playlist URL, not the browse root
  await expect(page).toHaveURL(/\/sonos\/browse\/spotify\/playlist\/abc123/)
})
