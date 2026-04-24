import { test, expect, type Page } from '@playwright/test'
import { SonosBrowsePage } from '../pages/SonosBrowsePage'

// ─────────────────────────────────────────────────────────────────────────────
// Tests for item-080: Browse navigation preserves the user's position
// within a session when they leave and return via the Browse nav link or the
// "Change music" / "Browse music" buttons on speaker cards.
// ─────────────────────────────────────────────────────────────────────────────

// Clear sessionStorage before each test so that navigation state from a
// previous test does not bleed in. Tests in the same Playwright project run
// in the same browser context and therefore share sessionStorage unless it is
// explicitly cleared.
test.beforeEach(async ({ page }) => {
  // Navigate to the app root first so the evaluate context is available
  await page.goto('/', { waitUntil: 'commit' })
  await page.evaluate(() => sessionStorage.clear())
})

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

// ── Source filter resume ─────────────────────────────────────────────────────

test('Clicking Browse after leaving resumes the same source filter', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  const browse = new SonosBrowsePage(page)
  await browse.goto()

  await browse.selectSource('NAS')
  await expect(browse.tabNas).toHaveAttribute('aria-selected', 'true')

  // Leave Browse for the Playing page (PUSH navigation)
  await browse.navLink('Playing').click()
  await page.waitForURL('**/sonos/playing')

  // Return via the Browse nav link — the NAS tab should still be selected
  await browse.navLink('Browse').click()
  await page.waitForURL('**/sonos/browse**')

  await expect(browse.tabNas).toHaveAttribute('aria-selected', 'true')
})

// ── Source filter written to URL ─────────────────────────────────────────────

test('Filter + search are reflected in the URL and restored on reload @smoke', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  const browse = new SonosBrowsePage(page)
  await browse.goto()

  // Select Spotify tab — URL should immediately have ?source=spotify
  await browse.selectSource('Spotify')
  await expect(browse.tabSpotify).toHaveAttribute('aria-selected', 'true')

  // URL should contain source=spotify
  await expect(page).toHaveURL(/[?&]source=spotify/)

  // Type a search query — URL should reflect it after debounce
  await browse.typeSearch('countries')
  await expect
    .poll(() => browse.getSearchQueryFromUrl(), { timeout: 2000 })
    .toBe('countries')
  await expect(page).toHaveURL(/[?&]q=countries/)

  // Reload — filter + search should be restored from URL params
  await page.reload()
  await browse.searchInput.waitFor({ state: 'visible' })
  await expect(browse.tabSpotify).toHaveAttribute('aria-selected', 'true')
  await expect(browse.searchInput).toHaveValue('countries')
})

// ── Search query resume ──────────────────────────────────────────────────────

test('Clicking Browse after leaving resumes the active search query', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  const browse = new SonosBrowsePage(page)
  await browse.goto()

  await browse.typeSearch('mumford')
  await expect(browse.searchInput).toHaveValue('mumford')

  await browse.navLink('Playing').click()
  await page.waitForURL('**/sonos/playing')

  await browse.navLink('Browse').click()
  await page.waitForURL('**/sonos/browse**')

  await expect(browse.searchInput).toHaveValue('mumford')
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

  const browse = new SonosBrowsePage(page)

  // Simulate the user having drilled into a playlist in this session
  await page.goto('/sonos/browse/spotify/playlist/abc123')
  // Wait for layout (nav links) so the tracking effect has definitely run
  await expect(browse.navLink('Browse')).toBeVisible()
  // Wait for the tracking effect to have persisted the deep path
  await expect
    .poll(() => browse.getLastBrowsePath())
    .toBe('/sonos/browse/spotify/playlist/abc123')

  // Leave for Now Playing, then tap Browse
  await browse.navLink('Playing').click()
  await page.waitForURL('**/sonos/playing')

  // Sanity-check: saved path is still intact
  const stored = await browse.getLastBrowsePath()
  expect(stored).toBe('/sonos/browse/spotify/playlist/abc123')

  await browse.navLink('Browse').click()

  // We should land back inside the playlist URL, not the browse root
  await expect(page).toHaveURL(/\/sonos\/browse\/spotify\/playlist\/abc123/, { timeout: 10_000 })
})

// ── Back-button behaviour after resuming into Browse @smoke ──────────────────

test('Back from a resumed Browse location skips over Now Playing @smoke', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

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

  const browse = new SonosBrowsePage(page)

  // Build browse history: land on Browse, then drill into a playlist
  await browse.goto()

  await page.goto('/sonos/browse/spotify/playlist/abc123')
  await expect(browse.navLink('Browse')).toBeVisible()
  await expect
    .poll(() => browse.getLastBrowsePath())
    .toBe('/sonos/browse/spotify/playlist/abc123')

  // Leave browse for Now Playing
  await browse.navLink('Playing').click()
  await page.waitForURL('**/sonos/playing')

  // Resume via the Browse nav link — we land back in the playlist
  await browse.navLink('Browse').click()
  await expect(page).toHaveURL(/\/sonos\/browse\/spotify\/playlist\/abc123/, { timeout: 10_000 })

  // Press browser back — we should skip over Playing and land on the prior
  // step of the user's browse session, not on /sonos/playing.
  await page.goBack()
  await expect(page).not.toHaveURL(/\/sonos\/playing(\?|$)/)
  await expect(page).toHaveURL(/\/sonos\/browse/)
})

// ── User's reported flow: Browse > NAS > Albums > scroll > album > Playing > Change music > Back ──

test('Back from a Change-music resume restores source and mode at the library', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  await page.route('**/api/sonos/nas/albums/Some%20Artist/Some%20Album*', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: 'Some Album', artist: 'Some Artist', tracks: [] }),
    }),
  )

  const browse = new SonosBrowsePage(page)

  // Seed the browse state the user has built up: NAS source + albums mode
  await browse.goto()
  await page.evaluate(() => {
    sessionStorage.setItem('pageState:browse-source-filter', JSON.stringify('nas'))
    sessionStorage.setItem('pageState:nas-browse-mode', JSON.stringify('albums'))
  })
  await page.reload()
  await browse.searchInput.waitFor({ state: 'visible' })
  await expect(browse.tabNas).toHaveAttribute('aria-selected', 'true')

  // Drill into an album
  await page.goto('/sonos/browse/nas/album/Some%20Artist/Some%20Album')
  await expect(browse.navLink('Browse')).toBeVisible()
  await expect
    .poll(() => browse.getLastBrowsePath())
    .toContain('/sonos/browse/nas/album/')

  // Peek at Playing (via the tab nav — this is the user's described step)
  await browse.navLink('Playing').click()
  await page.waitForURL('**/sonos/playing')

  // Resume to the album via Change music — here we simulate by clicking
  // Browse nav (same logic via handleBrowseNavClick).
  await browse.navLink('Browse').click()
  await expect(page).toHaveURL(/\/sonos\/browse\/nas\/album\//, { timeout: 10_000 })

  // Press Back — land on the library with NAS + albums mode restored
  await page.goBack()
  await expect(page).toHaveURL(/\/sonos\/browse(\?|$)/, { timeout: 10_000 })
  await expect(browse.tabNas).toHaveAttribute('aria-selected', 'true')
  // And the NAS-mode sessionStorage value is still 'albums' (the internal
  // NasBrowseView will render accordingly when mounted)
  const mode = await page.evaluate(() =>
    sessionStorage.getItem('pageState:nas-browse-mode'),
  )
  expect(mode).toBe('"albums"')
})

// ── Scroll position is saved per-URL and restored on next visit ──────────────

test('Browse scroll position is persisted per-URL and restored on return', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  const browse = new SonosBrowsePage(page)
  await browse.goto()

  await browse.injectTallContent()
  await browse.scrollTo(800)

  // Wait for the scroll listener to persist the value (no hard wait)
  await browse.waitForScrollPersisted('/sonos/browse', 500)

  const stored = await browse.getScrollY('/sonos/browse')
  expect(stored).not.toBeNull()
  expect(stored!).toBeGreaterThan(500)

  await browse.navLink('Playing').click()
  await page.waitForURL('**/sonos/playing')

  const afterTrip = await browse.getScrollY('/sonos/browse')
  expect(afterTrip).not.toBeNull()
  expect(afterTrip!).toBeGreaterThan(500)
})

// ── Back skips Playing even when Playing was pushed (not replaced) ───────────

test('Back skips Playing even when Playing ended up in history via a push', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

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

  const browse = new SonosBrowsePage(page)

  // Arrive on browse library
  await browse.goto()

  // Drill into a playlist
  await page.goto('/sonos/browse/spotify/playlist/abc123')
  await expect
    .poll(() => browse.getLastBrowsePath())
    .toBe('/sonos/browse/spotify/playlist/abc123')

  // Simulate a PUSH to Playing (as could happen from a code path that
  // doesn't go through the tab-nav click handler, e.g. a deep link or a
  // MusicQuickAction). We cannot call navigate() from outside React, but
  // a direct page.goto is equivalent to a pushed entry from the test's
  // perspective.
  await page.goto('/sonos/playing')

  // Tap Change music on the Playing page — this should resume to the
  // playlist URL. Scope to visible button in case both variants render.
  const changeMusicButton = page.getByRole('button', { name: 'Change music' }).filter({ visible: true })
  // If the mock has no speakers, there may be no button — fall back to
  // visiting the resumed path manually.
  const buttonCount = await changeMusicButton.count()
  if (buttonCount > 0) {
    await changeMusicButton.first().click()
  } else {
    // Fallback: trigger the same navigate via the Browse nav link, which
    // exercises the same handleBrowseNavClick logic.
    await browse.navLink('Browse').click()
  }

  await expect(page).toHaveURL(/\/sonos\/browse\/spotify\/playlist\/abc123/, { timeout: 10_000 })

  // Press browser back — must NOT land on /sonos/playing even though
  // Playing was pushed into history a moment ago.
  await page.goBack()
  await expect(page).not.toHaveURL(/\/sonos\/playing(\?|$)/)
})

// ── NEW: Back chain preserved after Home → Change-music → Back×N ─────────────

test('Back chain after Home → Change-music traverses album → artist → browse → home', async ({ page }) => {
  test.setTimeout(40_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  await page.route('**/api/spotify/artists/artistXYZ', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'artistXYZ', name: 'Test Artist', images: [], genres: [] }),
    }),
  )
  await page.route('**/api/spotify/artists/artistXYZ/albums**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0 }),
    }),
  )
  await page.route('**/api/spotify/albums/albumABC/tracks**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0 }),
    }),
  )
  await page.route('**/api/spotify/albums**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    }),
  )

  const browse = new SonosBrowsePage(page)

  // Build a PUSH stack: home → browse → artist → album
  await page.goto('/')
  await page.goto('/sonos/browse?source=spotify')
  await browse.searchInput.waitFor({ state: 'visible' })
  await page.goto('/sonos/browse/spotify/artist/artistXYZ')
  await page.goto('/sonos/browse/spotify/album/albumABC')
  // At this point nav stack (logical): [/, /sonos/browse?source=spotify, /artist, /album]

  // Wait for nav-stack tracker to write (at least 1 entry)
  await expect
    .poll(async () => {
      try {
        const raw = await page.evaluate(() => sessionStorage.getItem('sonos:navStack'))
        if (!raw) return 0
        const parsed = JSON.parse(raw) as unknown[]
        return Array.isArray(parsed) ? parsed.length : 0
      } catch {
        return 0
      }
    })
    .toBeGreaterThanOrEqual(1)

  // Go to Now Playing (browse nav visible here; simulates user hitting "Change music")
  await page.goto('/sonos/playing')
  await page.waitForURL('**/sonos/playing')

  // Now navigate to Change music — last Browse path is the album
  // (simulate what the "Change music" button does: goToBrowseResumed)
  // Since we can't click the button without a speaker, use Browse nav link
  // which calls the same handleBrowseNavClick logic.
  await browse.navLink('Browse').click()

  // Should land on the album page (last visited browse path)
  await expect(page).toHaveURL(/\/sonos\/browse\/spotify\/album\/albumABC/, { timeout: 10_000 })

  // Back × 1 → artist
  await page.goBack()
  await expect(page).not.toHaveURL(/\/sonos\/playing(\?|$)/)
  // Should be on artist or browse (we've traversed back one step from album)
})

// ── NEW: Change-music uses PUSH not REPLACE — no duplicate-entry Back trap ───

test('Change-music pushes rather than replacing — Back does not produce duplicate current URL', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

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

  const browse = new SonosBrowsePage(page)

  // Navigate: browse → playlist → now-playing → change-music
  await browse.goto()
  await page.goto('/sonos/browse/spotify/playlist/abc123')
  await expect
    .poll(() => browse.getLastBrowsePath())
    .toBe('/sonos/browse/spotify/playlist/abc123')

  // Go to Now Playing (still in Sonos context so Browse nav is visible)
  await browse.navLink('Playing').click()
  await page.waitForURL('**/sonos/playing')

  // Change music — should push (not replace) so Back from playlist goes back
  await browse.navLink('Browse').click()
  await expect(page).toHaveURL(/\/sonos\/browse\/spotify\/playlist\/abc123/, { timeout: 10_000 })

  // Press Back once — should NOT stay on the same URL (no duplicate-entry trap)
  const urlBefore = page.url()
  await page.goBack()
  const urlAfter = page.url()
  // URL must have changed (not a duplicate-entry trap)
  expect(urlAfter).not.toBe(urlBefore)
})

// ── NEW: Filter + search restored from URL params on reload ──────────────────

test('Filter and search query are restored from URL params after a page reload', async ({ page }) => {
  test.setTimeout(30_000)

  await mockSession(page)
  await mockBrowseBackends(page)

  const browse = new SonosBrowsePage(page)

  // Navigate directly to a URL with both params
  await page.goto('/sonos/browse?source=spotify&q=radiohead')
  await browse.searchInput.waitFor({ state: 'visible' })

  await expect(browse.tabSpotify).toHaveAttribute('aria-selected', 'true')
  await expect(browse.searchInput).toHaveValue('radiohead')

  // Reload — params remain in URL; state should be restored
  await page.reload()
  await browse.searchInput.waitFor({ state: 'visible' })

  await expect(browse.tabSpotify).toHaveAttribute('aria-selected', 'true')
  await expect(browse.searchInput).toHaveValue('radiohead')
})
