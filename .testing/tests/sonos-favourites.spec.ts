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

const FAVOURITES = [
  {
    id: 1,
    user_id: 'default',
    source: 'sonos',
    source_uri: 'x-sonosapi-radio:s1',
    title: 'BBC Radio 4',
    album_art_uri: null,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    user_id: 'default',
    source: 'spotify',
    source_uri: 'spotify:playlist:abc',
    title: 'Chill Vibes',
    album_art_uri: null,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00Z',
  },
]

// ── Helper: navigate to Favourites tab ───────────────────────────────────────

async function goToFavourites(page: Page) {
  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')
  await page.getByRole('tab', { name: 'Favourites' }).click()
}

// ── Test (a): Favourites tab shows favourites list with items ─────────────────

test('Favourites tab shows the favourites list with items', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Favourites-smoke')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAVOURITES) }),
  )

  await goToFavourites(page)

  const list = page.getByRole('list', { name: 'Favourites — drag to reorder' })
  await expect(list).toBeVisible()

  const items = list.getByRole('listitem')
  await expect(items).toHaveCount(2)

  await page.screenshot({ path: '.testing/results/sonos-favourites-01-list.png', fullPage: true })
})

// ── Test (b): Each item shows title text ─────────────────────────────────────

test('Favourites tab items show their titles', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Favourites-titles')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAVOURITES) }),
  )

  await goToFavourites(page)

  await expect(page.getByText('BBC Radio 4')).toBeVisible()
  await expect(page.getByText('Chill Vibes')).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-favourites-02-titles.png', fullPage: true })
})

// ── Test (c): Context menu opens when More Options is clicked ─────────────────

test('Favourites context menu opens and sets aria-expanded when triggered', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Favourites-context-menu-open')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAVOURITES) }),
  )

  await goToFavourites(page)

  const moreOptionsBtn = page.getByRole('button', { name: 'More options for BBC Radio 4' })
  await expect(moreOptionsBtn).toHaveAttribute('aria-expanded', 'false')

  await moreOptionsBtn.click()

  await expect(moreOptionsBtn).toHaveAttribute('aria-expanded', 'true')

  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-favourites-03-context-menu-open.png', fullPage: true })
})

// ── Test (d): Context menu contains Play next, Add to queue, Remove ───────────

test('Favourites context menu contains Play next, Add to queue, Remove items', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Favourites-menu-items')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAVOURITES) }),
  )

  await goToFavourites(page)

  await page.getByRole('button', { name: 'More options for BBC Radio 4' }).click()

  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Play next' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Add to queue' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Remove' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-favourites-04-menu-items.png', fullPage: true })
})

// ── Test (e): Context menu closes and item removed after clicking Remove ───────

test('Favourites Remove menu item removes the item from the list', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Favourites-remove')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  // Intercept all /api/favourites* requests and route based on method + path
  await page.route('**/api/favourites**', route => {
    const method = route.request().method()
    const url = route.request().url()
    if (method === 'GET' && !url.match(/\/api\/favourites\/\d/)) {
      // GET /api/favourites — return the list
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAVOURITES) })
    } else if (method === 'DELETE') {
      // DELETE /api/favourites/:id — succeed with JSON null since fetchApi always calls res.json()
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    } else {
      route.continue()
    }
  })

  await goToFavourites(page)

  // Open context menu for BBC Radio 4 and click Remove
  await page.getByRole('button', { name: 'More options for BBC Radio 4' }).click()
  const menu = page.getByRole('menu')
  await menu.getByRole('menuitem', { name: 'Remove' }).click()

  // Menu should close after clicking Remove (150ms onBlur delay + animation)
  await page.waitForTimeout(300)
  await expect(page.getByRole('menu')).toBeHidden()

  // Optimistic update removes the item immediately — list should shrink to 1 item
  const list = page.getByRole('list', { name: 'Favourites — drag to reorder' })
  await expect(list.getByRole('listitem')).toHaveCount(1, { timeout: 3_000 })

  // The remaining item should be Chill Vibes
  await expect(list.getByText('Chill Vibes')).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-favourites-05-removed.png', fullPage: true })
})

// ── Test (f): "Add from Browse" button switches to Browse tab ─────────────────

test('Favourites "Add from Browse" button navigates to the Browse tab', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Favourites-add-from-browse')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAVOURITES) }),
  )
  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ connected: false }) }),
  )

  await goToFavourites(page)

  await page.getByRole('button', { name: 'Add from Browse' }).click()

  // Browse tab should now be active
  const browseTab = page.getByRole('tab', { name: 'Browse' })
  await expect(browseTab).toHaveAttribute('aria-selected', 'true')

  // Browse source filter tabs should be visible
  await expect(page.getByRole('tablist', { name: 'Browse by source' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-favourites-06-add-from-browse.png', fullPage: true })
})

// ── Test (g): Empty state shows "No favourites yet" and "Browse music" button ──

test('Favourites empty state shows "No favourites yet" heading and Browse music button', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Favourites-empty')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )

  await goToFavourites(page)

  await expect(page.getByRole('heading', { name: 'No favourites yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Browse music' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-favourites-07-empty.png', fullPage: true })
})

// ── Test (h): Error state shows "Could not load favourites" and Retry button ───

test('Favourites error state shows error message and Retry button', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'Favourites-error')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) }),
  )

  await goToFavourites(page)

  await expect(page.getByText('Could not load favourites')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-favourites-08-error.png', fullPage: true })
})
