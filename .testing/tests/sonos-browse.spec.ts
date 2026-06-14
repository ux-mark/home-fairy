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

const LIBRARY_GENRES = [
  { title: 'Rock', id: 'rock' },
  { title: 'Jazz', id: 'jazz' },
]

const RADIO_STATIONS = [
  { title: 'BBC Radio 4', id: 'radio1', uri: 'x-sonosapi-stream:radio1' },
]

const SPOTIFY_DISCONNECTED = { connected: false }
const SPOTIFY_CONNECTED = { connected: true, display_name: 'testuser' }

// ── Helper: navigate to Browse page ──────────────────────────────────────────

async function goToBrowse(page: Page) {
  await page.goto('/sonos/browse')
  await page.waitForLoadState('networkidle')
}

// ── Test (a): Browse tab shows search input and source filter tabs ─────────────

test('Browse tab shows search input and source filter tabs', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Browse-smoke')

  await mockSession(page)

  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOTIFY_DISCONNECTED) }),
  )
  await page.route('**/api/sonos/library/genres', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIBRARY_GENRES) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RADIO_STATIONS) }),
  )

  await goToBrowse(page)

  await expect(page.getByLabel('Search music')).toBeVisible()

  const sourceTablist = page.getByRole('tablist', { name: 'Browse by source' })
  await expect(sourceTablist).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-browse-01-search-and-sources.png', fullPage: true })
})

// ── Test (b): Source filter tabs All, NAS, Spotify, Radio, Favourites ─────────

test('Browse source filter shows All, NAS, Spotify, Radio tabs', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Browse-source-tabs')

  await mockSession(page)

  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOTIFY_DISCONNECTED) }),
  )
  await page.route('**/api/sonos/library/genres', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIBRARY_GENRES) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RADIO_STATIONS) }),
  )

  await goToBrowse(page)

  // Source filter tabs: All, NAS, Spotify, Radio (no Favourites source in BrowseTab)
  const sourceTablist = page.getByRole('tablist', { name: 'Browse by source' })
  await expect(sourceTablist.getByRole('tab', { name: 'All' })).toBeVisible()
  await expect(sourceTablist.getByRole('tab', { name: 'NAS' })).toBeVisible()
  await expect(sourceTablist.getByRole('tab', { name: 'Spotify' })).toBeVisible()
  await expect(sourceTablist.getByRole('tab', { name: 'Radio' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-browse-02-source-tabs.png', fullPage: true })
})

// ── Test (c): Clicking NAS tab switches to NAS content ───────────────────────

test('Browse NAS tab shows browse mode tabs', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Browse-nas')

  await mockSession(page)

  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOTIFY_DISCONNECTED) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RADIO_STATIONS) }),
  )

  await goToBrowse(page)

  await page.getByRole('tablist', { name: 'Browse by source' }).getByRole('tab', { name: 'NAS' }).click()
  await page.waitForLoadState('networkidle')

  // NAS view shows browse mode tabs: Countries, Albums, Artists, Songs
  await expect(page.getByRole('tab', { name: 'Countries' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Albums' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Artists' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-browse-03-nas-browse-modes.png', fullPage: true })
})

// ── Test (d): Clicking Radio tab switches to Radio content ────────────────────

test('Browse Radio tab shows stations from mocked response', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Browse-radio')

  await mockSession(page)

  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RADIO_STATIONS) }),
  )
  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOTIFY_DISCONNECTED) }),
  )
  await page.route('**/api/sonos/library/genres', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIBRARY_GENRES) }),
  )

  await goToBrowse(page)

  await page.getByRole('tablist', { name: 'Browse by source' }).getByRole('tab', { name: 'Radio' }).click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByText('BBC Radio 4')).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-browse-04-radio-stations.png', fullPage: true })
})

// ── Test (e): Clicking Spotify tab when disconnected shows SpotifyBrowseView ──

test('Browse Spotify tab shows SpotifyBrowseView when disconnected', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Browse-spotify-disconnected')

  await mockSession(page)

  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOTIFY_DISCONNECTED) }),
  )
  await page.route('**/api/sonos/library/genres', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIBRARY_GENRES) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RADIO_STATIONS) }),
  )

  await goToBrowse(page)

  await page.getByRole('tablist', { name: 'Browse by source' }).getByRole('tab', { name: 'Spotify' }).click()
  await page.waitForLoadState('networkidle')

  // SpotifyBrowseView renders when Spotify tab is active — check the panel is present
  const browsePanel = page.getByRole('tabpanel', { name: /browse-tab-spotify/i })
  // Alternatively check by the panel ID attribute
  const spotifyPanel = page.locator('#browse-panel-spotify')
  await expect(spotifyPanel).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-browse-05-spotify-disconnected.png', fullPage: true })
})

// ── Test (f): Typing in search bar updates value; clear button appears ─────────

test('Browse search input updates and shows clear button when non-empty', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Browse-search-input')

  await mockSession(page)

  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOTIFY_DISCONNECTED) }),
  )
  await page.route('**/api/sonos/library/genres', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIBRARY_GENRES) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RADIO_STATIONS) }),
  )

  await goToBrowse(page)

  const searchInput = page.getByLabel('Search music')

  // Clear button should not be visible before typing
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeHidden()

  // Type a query
  await searchInput.fill('Radio')
  await expect(searchInput).toHaveValue('Radio')

  // Clear button should now be visible
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-browse-06-search-value.png', fullPage: true })
})

// ── Test (g): Clicking clear button clears the input ─────────────────────────

test('Browse clear search button clears the search input', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Browse-clear-search')

  await mockSession(page)

  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOTIFY_DISCONNECTED) }),
  )
  await page.route('**/api/sonos/library/genres', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIBRARY_GENRES) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RADIO_STATIONS) }),
  )

  await goToBrowse(page)

  const searchInput = page.getByLabel('Search music')
  await searchInput.fill('Radiohead')
  await expect(searchInput).toHaveValue('Radiohead')

  await page.getByRole('button', { name: 'Clear search' }).click()

  await expect(searchInput).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeHidden()

  await page.screenshot({ path: '.testing/results/sonos-browse-07-cleared-search.png', fullPage: true })
})

// ── Test (h): All source view shows source preview cards ─────────────────────

test('Browse All source view shows NAS, Spotify, Radio cards', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Browse-all-sources')

  await mockSession(page)

  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOTIFY_CONNECTED) }),
  )
  await page.route('**/api/sonos/library/genres', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIBRARY_GENRES) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RADIO_STATIONS) }),
  )

  await goToBrowse(page)

  // "All" tab is active by default — source preview cards (NAS, Spotify, Radio) should be visible
  // Each card is a button containing the source name text (no Favourites source in BrowseTab)
  await expect(page.getByRole('button', { name: /NAS/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Spotify/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Radio/i }).first()).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-browse-08-all-sources.png', fullPage: true })
})
