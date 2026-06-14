import { test, expect, type Page, type Route } from '@playwright/test'

// ── Fairylist + queue overhaul E2E ───────────────────────────────────────────
// Covers the fairylist-queue-overhaul branch: source-aware item queueing
// (spotify / legacy-wrapped / NAS / radio), whole-fairylist queue + play
// endpoints, immediate clear-queue with undo, and the queue invalidation-key
// fix. All API traffic is mocked via page.route; the vite proxy points at a
// dead port so any unmocked call fails fast.

// ── Session mock (AuthGuard) ──────────────────────────────────────────────────

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

// ── Shared payloads ───────────────────────────────────────────────────────────

// Living Room PLAYING — PlaybackStateContext auto-selects this speaker,
// enabling queue/play buttons everywhere.
const PLAYING_NOW_PLAYING = [
  {
    roomName: 'Living Room',
    speakerName: 'Living Room',
    state: {
      playbackState: 'PLAYING',
      currentTrack: {
        artist: 'Radiohead',
        title: 'Karma Police',
        album: 'OK Computer',
        albumArtUri: '',
        type: 'track',
        uri: 'x-sonos-spotify:spotify:track:abc123',
      },
      volume: 50,
      mute: false,
      trackNo: 1,
      elapsedTime: 45,
      duration: 262,
      currentPlayMode: 'NORMAL',
    },
    error: false,
  },
]

const QUEUE_ITEMS = [
  {
    title: 'Karma Police',
    artist: 'Radiohead',
    album: 'OK Computer',
    albumArtUri: '',
    uri: 'x-sonos-spotify:spotify:track:abc123',
    duration: 262,
  },
  {
    title: 'No Surprises',
    artist: 'Radiohead',
    album: 'OK Computer',
    albumArtUri: '',
    uri: 'x-sonos-spotify:spotify:track:def456',
    duration: 228,
  },
]

const FAIRYLISTS = [
  { id: 1, name: 'Road Trip', created_by: 'test-user', created_at: '2026-01-01T00:00:00Z', item_count: 4 },
]

// Mixed-source items: bare spotify, legacy pre-migration wrapped URI (still
// source:'nas'), a real NAS file, and a radio stream.
const FAIRYLIST_DETAIL = {
  fairylist: { id: 1, name: 'Road Trip', created_by: 'test-user', created_at: '2026-01-01T00:00:00Z', item_count: 4 },
  items: [
    {
      id: 11,
      fairylist_id: 1,
      source: 'spotify',
      source_uri: 'spotify:track:abc123',
      title: 'Spotify Song',
      artist: 'Spot Artist',
      album_art_uri: null,
      sort_order: 1,
      added_by: 'test-user',
      added_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 12,
      fairylist_id: 1,
      source: 'nas',
      source_uri: 'x-sonos-spotify:spotify%3atrack%3adef456?sid=12&flags=8232&sn=4',
      title: 'Legacy Song',
      artist: 'Legacy Artist',
      album_art_uri: null,
      sort_order: 2,
      added_by: 'test-user',
      added_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 13,
      fairylist_id: 1,
      source: 'nas',
      source_uri: 'x-file-cifs://nas/track.flac',
      title: 'NAS Song',
      artist: 'NAS Artist',
      album_art_uri: null,
      sort_order: 3,
      added_by: 'test-user',
      added_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 14,
      fairylist_id: 1,
      source: 'radio',
      source_uri: 'x-sonosapi-stream:s12345?sid=254',
      title: 'Radio Station',
      artist: null,
      album_art_uri: null,
      sort_order: 4,
      added_by: 'test-user',
      added_at: '2026-01-01T00:00:00Z',
    },
  ],
}

// ── Request capture helpers ───────────────────────────────────────────────────

interface CapturedRequest {
  method: string
  url: string
  body: unknown
}

function capture(captured: CapturedRequest[], route: Route) {
  const req = route.request()
  let body: unknown = null
  const raw = req.postData()
  if (raw) {
    try { body = JSON.parse(raw) } catch { body = raw }
  }
  captured.push({ method: req.method(), url: req.url(), body })
}

/**
 * Standard mock set for the Favourites page: session, now-playing (Living Room
 * PLAYING), empty favourites, fairylist list + detail, and a sonos catch-all
 * that records every mutation request. Returns the capture array.
 */
async function mockFavouritesPage(page: Page) {
  const captured: CapturedRequest[] = []

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )

  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )

  // Method-dispatched fairylist routes: list, detail, queue, play
  await page.route('**/api/fairylists**', route => {
    const method = route.request().method()
    const url = route.request().url()
    if (method === 'GET' && /\/api\/fairylists$/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAIRYLISTS) })
    }
    if (method === 'GET' && /\/api\/fairylists\/1$/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAIRYLIST_DETAIL) })
    }
    if (method === 'POST' && url.includes('/queue/')) {
      capture(captured, route)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, queued: 4, skipped: [] }),
      })
    }
    if (method === 'POST' && url.includes('/play/')) {
      capture(captured, route)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, queued: 4, skipped: [] }),
      })
    }
    return route.continue()
  })

  // Sonos mutation endpoints — record everything, fulfil with null
  await page.route('**/api/sonos/play-spotify/**', route => {
    capture(captured, route)
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })
  await page.route('**/api/sonos/play-uri/**', route => {
    capture(captured, route)
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })
  await page.route('**/api/sonos/queue/**', route => {
    const method = route.request().method()
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUEUE_ITEMS) })
    }
    capture(captured, route)
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })

  return captured
}

async function goToFavourites(page: Page) {
  await page.goto('/sonos/favourites')
  await page.waitForLoadState('networkidle')
}

async function openFairylistDetail(page: Page) {
  await page.getByRole('button', { name: 'Open Road Trip' }).click()
  await expect(page.getByRole('list', { name: 'Tracks in Road Trip — drag to reorder' })).toBeVisible()
}

/** Open the MusicItemMenu kebab for a track and click a menuitem. */
async function clickItemMenuAction(page: Page, title: string, action: string) {
  await page.getByRole('button', { name: `More options for ${title}` }).click()
  await page.waitForTimeout(300)
  await page.getByRole('menu').getByRole('menuitem', { name: action, exact: true }).click()
}

// ── 1. Fairylist detail renders mixed-source items ────────────────────────────

test('Fairylist detail opens from the accordion and shows all four mixed-source tracks', async ({ page }) => {
  test.setTimeout(45_000)
  await mockFavouritesPage(page)
  await goToFavourites(page)

  // Accordion list with the new row layout
  const list = page.getByRole('list', { name: 'Fairylists' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('button', { name: 'Open Road Trip' })).toBeVisible()
  await expect(list.getByRole('button', { name: 'Play Road Trip', exact: true })).toBeVisible()
  await expect(list.getByRole('button', { name: 'More options for Road Trip' })).toBeVisible()

  await openFairylistDetail(page)

  await expect(page.getByRole('button', { name: 'Back to Fairylists' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play all tracks in Road Trip' })).toBeVisible()

  const tracks = page.getByRole('list', { name: 'Tracks in Road Trip — drag to reorder' })
  await expect(tracks.getByRole('listitem')).toHaveCount(4)
  await expect(tracks.getByText('Spotify Song')).toBeVisible()
  await expect(tracks.getByText('Legacy Song')).toBeVisible()
  await expect(tracks.getByText('NAS Song')).toBeVisible()
  await expect(tracks.getByText('Radio Station')).toBeVisible()

  await page.screenshot({ path: '.testing/results/fairylist-queue-01-detail.png', fullPage: true })
})

// ── 2. Spotify item → play-spotify queue ─────────────────────────────────────

test('Item "Add to queue" on a spotify track POSTs play-spotify with action queue', async ({ page }) => {
  test.setTimeout(45_000)
  const captured = await mockFavouritesPage(page)
  await goToFavourites(page)
  await openFairylistDetail(page)

  await clickItemMenuAction(page, 'Spotify Song', 'Add to queue')

  await expect(page.getByText('Added "Spotify Song" to queue')).toBeVisible()

  const req = captured.find(r => r.url.includes('/api/sonos/play-spotify/'))
  expect(req).toBeTruthy()
  expect(req!.method).toBe('POST')
  expect(req!.url).toContain('/api/sonos/play-spotify/Living%20Room')
  expect(req!.body).toEqual({ uri: 'spotify:track:abc123', action: 'queue' })

  await page.screenshot({ path: '.testing/results/fairylist-queue-02-spotify-add.png', fullPage: true })
})

// ── 3. Legacy wrapped URI → normalised play-spotify next ─────────────────────

test('Item "Play next" on a legacy x-sonos-spotify track normalises the URI client-side', async ({ page }) => {
  test.setTimeout(45_000)
  const captured = await mockFavouritesPage(page)
  await goToFavourites(page)
  await openFairylistDetail(page)

  await clickItemMenuAction(page, 'Legacy Song', 'Play next')

  await expect(page.getByText('"Legacy Song" will play next')).toBeVisible()

  const req = captured.find(r => r.url.includes('/api/sonos/play-spotify/'))
  expect(req).toBeTruthy()
  expect(req!.method).toBe('POST')
  expect(req!.url).toContain('/api/sonos/play-spotify/Living%20Room')
  // Proves the legacy-URI client normalisation: wrapped + URL-encoded → bare
  expect(req!.body).toEqual({ uri: 'spotify:track:def456', action: 'next' })

  await page.screenshot({ path: '.testing/results/fairylist-queue-03-legacy-next.png', fullPage: true })
})

// ── 4. NAS file item → queue/add with raw URI ────────────────────────────────

test('Item "Add to queue" on a NAS file POSTs the x-file-cifs URI to queue/add', async ({ page }) => {
  test.setTimeout(45_000)
  const captured = await mockFavouritesPage(page)
  await goToFavourites(page)
  await openFairylistDetail(page)

  await clickItemMenuAction(page, 'NAS Song', 'Add to queue')

  await expect(page.getByText('Added "NAS Song" to queue')).toBeVisible()

  const req = captured.find(r => r.url.includes('/api/sonos/queue/') && r.url.endsWith('/add'))
  expect(req).toBeTruthy()
  expect(req!.method).toBe('POST')
  expect(req!.url).toContain('/api/sonos/queue/Living%20Room/add')
  expect(req!.body).toEqual({ uri: 'x-file-cifs://nas/track.flac' })
  // Must NOT have gone through the spotify path
  expect(captured.find(r => r.url.includes('/play-spotify/'))).toBeFalsy()

  await page.screenshot({ path: '.testing/results/fairylist-queue-04-nas-add.png', fullPage: true })
})

// ── 5. Radio item → toast only, no API call ──────────────────────────────────

test('Radio item "Add to queue" shows a toast and fires no sonos request', async ({ page }) => {
  test.setTimeout(45_000)
  const captured = await mockFavouritesPage(page)
  await goToFavourites(page)
  await openFairylistDetail(page)

  await clickItemMenuAction(page, 'Radio Station', 'Add to queue')

  await expect(page.getByText("Radio stations can't be queued")).toBeVisible()

  // No mutation hit any sonos or fairylist endpoint
  expect(captured).toHaveLength(0)

  await page.screenshot({ path: '.testing/results/fairylist-queue-05-radio-blocked.png', fullPage: true })
})

// ── 6. Whole-fairylist queue from the accordion kebab ────────────────────────

test('Fairylist kebab "Add to queue" POSTs mode append; "Play next" POSTs mode next', async ({ page }) => {
  test.setTimeout(45_000)
  const captured = await mockFavouritesPage(page)
  await goToFavourites(page)

  // Add to queue → mode append
  await page.getByRole('button', { name: 'More options for Road Trip' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('menu').getByRole('menuitem', { name: 'Add Road Trip to queue' }).click()

  await expect(page.getByText('Added "Road Trip" to queue')).toBeVisible()

  const appendReq = captured.find(r => r.url.includes('/api/fairylists/1/queue/'))
  expect(appendReq).toBeTruthy()
  expect(appendReq!.method).toBe('POST')
  expect(appendReq!.url).toContain('/api/fairylists/1/queue/Living%20Room')
  expect(appendReq!.body).toEqual({ mode: 'append' })

  // Play next → mode next
  await page.getByRole('button', { name: 'More options for Road Trip' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('menu').getByRole('menuitem', { name: 'Play Road Trip next' }).click()

  await expect(page.getByText('"Road Trip" will play next')).toBeVisible()

  const nextReq = captured.filter(r => r.url.includes('/api/fairylists/1/queue/')).at(-1)
  expect(nextReq!.body).toEqual({ mode: 'next' })

  await page.screenshot({ path: '.testing/results/fairylist-queue-06-whole-list-queue.png', fullPage: true })
})

// ── 7. Fairylist Play → play endpoint + replaced-queue confirmation ──────────

test('Fairylist Play button POSTs the play endpoint and shows the replaced-queue confirmation', async ({ page }) => {
  test.setTimeout(45_000)
  const captured = await mockFavouritesPage(page)
  await goToFavourites(page)

  await page.getByRole('button', { name: 'Play Road Trip', exact: true }).click()

  await expect(page.getByText('Playing "Road Trip" — replaced queue')).toBeVisible()

  const req = captured.find(r => r.url.includes('/api/fairylists/1/play/'))
  expect(req).toBeTruthy()
  expect(req!.method).toBe('POST')
  expect(req!.url).toContain('/api/fairylists/1/play/Living%20Room')

  await page.screenshot({ path: '.testing/results/fairylist-queue-07-play.png', fullPage: true })
})

// ── 8. Inline Up-next clear: immediate, no confirm, undo restores ─────────────

test('Inline queue Clear clears immediately with undo snackbar; Undo restores the queue', async ({ page }) => {
  test.setTimeout(45_000)
  const captured: CapturedRequest[] = []

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )
  await page.route('**/api/sonos/queue/**', route => {
    const method = route.request().method()
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUEUE_ITEMS) })
    }
    capture(captured, route)
    if (route.request().url().includes('/restore')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ added: 2, failedCount: 0 }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  // The inline Up-next header on /sonos has its own Clear queue button.
  // The (closed) QueueView sheet exposes a second one inside its "Queue
  // controls" group — the inline button renders first in the DOM.
  await page.getByRole('button', { name: 'Clear queue' }).first().click()

  // No confirm dialog — the old "Clear the queue?" AlertDialog is gone.
  // (The closed QueueView sheet keeps role=dialog in the DOM, so scope by name.)
  await expect(page.getByText('Clear the queue?')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: /Clear/i })).toHaveCount(0)

  // DELETE fired immediately
  await expect.poll(() =>
    captured.filter(r => r.method === 'DELETE' && r.url.includes('/api/sonos/queue/Living%20Room/clear')).length,
  ).toBe(1)

  // Undo snackbar visible with the track count
  await expect(page.getByText('Queue cleared · 2 tracks')).toBeVisible()

  await page.screenshot({ path: '.testing/results/fairylist-queue-08a-inline-cleared.png', fullPage: true })

  // Undo → POST /restore with both uris
  await page.getByRole('button', { name: 'Undo' }).click()

  await expect.poll(() =>
    captured.filter(r => r.method === 'POST' && r.url.includes('/api/sonos/queue/Living%20Room/restore')).length,
  ).toBe(1)
  const restore = captured.find(r => r.url.includes('/restore'))
  expect(restore!.body).toEqual({ uris: QUEUE_ITEMS.map(q => q.uri) })

  await page.screenshot({ path: '.testing/results/fairylist-queue-08b-inline-restored.png', fullPage: true })
})

// ── 9. QueueView sheet clear: same immediate-clear semantics ──────────────────

test('QueueView sheet Clear clears immediately with undo snackbar and restore', async ({ page }) => {
  test.setTimeout(45_000)
  const captured: CapturedRequest[] = []

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )
  await page.route('**/api/sonos/queue/**', route => {
    const method = route.request().method()
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUEUE_ITEMS) })
    }
    capture(captured, route)
    if (route.request().url().includes('/restore')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ added: 2, failedCount: 0 }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: /See full queue/ }).click()
  const dialog = page.getByRole('dialog', { name: /Queue/ })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Clear queue' }).click()

  // No confirm dialog appears — clear is immediate
  await expect(page.getByText('Clear the queue?')).toHaveCount(0)
  await expect.poll(() =>
    captured.filter(r => r.method === 'DELETE' && r.url.includes('/api/sonos/queue/Living%20Room/clear')).length,
  ).toBe(1)

  // Undo snackbar inside the sheet
  await expect(dialog.getByText('Queue cleared · 2 tracks')).toBeVisible()

  await page.screenshot({ path: '.testing/results/fairylist-queue-09a-sheet-cleared.png', fullPage: true })

  await dialog.getByRole('button', { name: 'Undo' }).click()

  await expect.poll(() =>
    captured.filter(r => r.method === 'POST' && r.url.includes('/api/sonos/queue/Living%20Room/restore')).length,
  ).toBe(1)
  const restore = captured.find(r => r.url.includes('/restore'))
  expect(restore!.body).toEqual({ uris: QUEUE_ITEMS.map(q => q.uri) })

  await page.screenshot({ path: '.testing/results/fairylist-queue-09b-sheet-restored.png', fullPage: true })
})

// ── 10. Queue invalidation-key fix: add-to-queue triggers a queue refetch ─────

test('Queue GET refetches after a fairylist add-to-queue (invalidation-key fix)', async ({ page }) => {
  test.setTimeout(60_000)
  let queueGets = 0

  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )
  await page.route('**/api/favourites', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  await page.route('**/api/fairylists**', route => {
    const method = route.request().method()
    const url = route.request().url()
    if (method === 'GET' && /\/api\/fairylists$/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAIRYLISTS) })
    }
    if (method === 'GET' && /\/api\/fairylists\/1$/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAIRYLIST_DETAIL) })
    }
    if (method === 'POST' && url.includes('/queue/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, queued: 4, skipped: [] }),
      })
    }
    return route.continue()
  })
  await page.route('**/api/sonos/queue/**', route => {
    if (route.request().method() === 'GET') {
      queueGets++
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUEUE_ITEMS) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })

  // 1. Land on /sonos — InlineQueue mounts and fetches the queue
  await page.goto('/sonos')
  await expect(page.getByRole('button', { name: /See full queue/ })).toBeVisible({ timeout: 15_000 })
  expect(queueGets).toBeGreaterThanOrEqual(1)

  // 2. Client-side navigate to Favourites (queue query becomes inactive)
  await page.getByRole('link', { name: 'Favourites' }).click()
  await page.waitForURL('**/sonos/favourites')

  // 3. Whole-fairylist add-to-queue → invalidateQueue marks the cached query invalid
  await page.getByRole('button', { name: 'More options for Road Trip' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('menu').getByRole('menuitem', { name: 'Add Road Trip to queue' }).click()
  await expect(page.getByText('Added "Road Trip" to queue')).toBeVisible()

  const before = queueGets

  // 4. Navigate back to Playing — the invalidated query must refetch on remount
  await page.getByRole('link', { name: 'Playing' }).click()
  await expect(page.getByRole('button', { name: /See full queue/ })).toBeVisible({ timeout: 15_000 })

  await expect.poll(() => queueGets, { timeout: 10_000 }).toBeGreaterThan(before)

  await page.screenshot({ path: '.testing/results/fairylist-queue-10-refetch.png', fullPage: true })
})

// ── 11. Fairylist Play is undoable: snapshot → clear → restore ────────────────

test('Fairylist Play with a non-empty previous queue shows an undo snackbar; Undo clears then restores', async ({ page }) => {
  test.setTimeout(45_000)
  const captured = await mockFavouritesPage(page)
  await goToFavourites(page)

  await page.getByRole('button', { name: 'Play Road Trip', exact: true }).click()

  // The replace confirmation arrives as an undo snackbar, not a plain toast
  await expect(page.getByText('Playing "Road Trip" — replaced queue')).toBeVisible()
  const undoButton = page.getByRole('button', { name: 'Undo' })
  await expect(undoButton).toBeVisible()

  await page.screenshot({ path: '.testing/results/fairylist-queue-11a-play-undoable.png', fullPage: true })

  await undoButton.click()

  // A replace-undo must clear the Fairylist tracks before restoring the
  // previous queue — assert both calls fired, in that order.
  await expect.poll(() =>
    captured.filter(r => r.method === 'POST' && r.url.includes('/api/sonos/queue/Living%20Room/restore')).length,
  ).toBe(1)
  const clearIdx = captured.findIndex(r => r.method === 'DELETE' && r.url.includes('/api/sonos/queue/Living%20Room/clear'))
  const restoreIdx = captured.findIndex(r => r.method === 'POST' && r.url.includes('/api/sonos/queue/Living%20Room/restore'))
  expect(clearIdx).toBeGreaterThanOrEqual(0)
  expect(restoreIdx).toBeGreaterThan(clearIdx)
  expect(captured[restoreIdx].body).toEqual({ uris: QUEUE_ITEMS.map(q => q.uri) })

  await page.screenshot({ path: '.testing/results/fairylist-queue-11b-play-undone.png', fullPage: true })
})

// ── 12. Skipped tracks are surfaced in the toast ──────────────────────────────

test('Queue and play responses with skipped tracks qualify the confirmation message', async ({ page }) => {
  test.setTimeout(45_000)
  await mockFavouritesPage(page)

  // Override the fairylist endpoints (later routes win) with skipped tracks
  await page.route('**/api/fairylists/1/queue/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        queued: 2,
        skipped: [
          { title: 'Radio Station', reason: 'radio streams cannot be queued' },
          { title: 'Legacy Song', reason: 'unsupported uri' },
        ],
      }),
    }),
  )
  await page.route('**/api/fairylists/1/play/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        queued: 3,
        skipped: [{ title: 'Radio Station', reason: 'radio streams cannot be queued' }],
      }),
    }),
  )

  await goToFavourites(page)

  // Whole-list add to queue → plural skipped count
  await page.getByRole('button', { name: 'More options for Road Trip' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('menu').getByRole('menuitem', { name: 'Add Road Trip to queue' }).click()
  await expect(page.getByText('Added "Road Trip" to queue — 2 tracks skipped')).toBeVisible()

  // Play → singular skipped count, replaced-queue wording
  await page.getByRole('button', { name: 'Play Road Trip', exact: true }).click()
  await expect(page.getByText('Playing "Road Trip" — 1 track skipped (replaced queue)')).toBeVisible()

  await page.screenshot({ path: '.testing/results/fairylist-queue-12-skipped.png', fullPage: true })
})

// ── 13. Radio rows in Browse hide the queue actions entirely ──────────────────

test('Radio station row in Browse offers no "Add to queue" or "Play next" menu items', async ({ page }) => {
  test.setTimeout(45_000)
  await mockSession(page)
  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ title: 'FM Fairy', uri: 'x-sonosapi-stream:s999?sid=254', albumArtUri: '' }]),
    }),
  )

  await page.goto('/sonos/browse?source=radio')

  await page.getByRole('button', { name: 'More options for FM Fairy' }).click()
  await page.waitForTimeout(300)

  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Add to Fairylist' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Add to queue' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: 'Play next' })).toHaveCount(0)

  await page.screenshot({ path: '.testing/results/fairylist-queue-13-radio-browse.png', fullPage: true })
})
