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

const PAUSED_NOW_PLAYING = [
  {
    roomName: 'Living Room',
    speakerName: 'Living Room',
    state: {
      playbackState: 'PAUSED_PLAYBACK',
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

const ERROR_NOW_PLAYING = [
  {
    roomName: 'Living Room',
    speakerName: 'Living Room',
    state: null,
    error: true,
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

// ── Test (a): Now Playing shows track title and artist when playing ────────────

test('Now Playing tab shows track title and artist when speaker is playing', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-smoke')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  await expect(page.getByText('Karma Police')).toBeVisible()
  await expect(page.getByText('Radiohead')).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-now-playing-01-playing.png', fullPage: true })
})

// ── Test (b): Shows playback controls group when playing ─────────────────────

test('Now Playing tab shows playback controls when playing', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-controls')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  const controls = page.getByRole('group', { name: 'Playback controls' })
  await expect(controls).toBeVisible()

  await expect(page.getByRole('button', { name: 'Previous track' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next track' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-now-playing-02-controls.png', fullPage: true })
})

// ── Test (c): Play/Pause button label reflects playback state ─────────────────

test('Now Playing Pause button is labelled "Pause" when playing', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-pause-label')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  // Scope to playback controls group to avoid ambiguity with other buttons
  const controls = page.getByRole('group', { name: 'Playback controls' })
  await expect(controls.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-now-playing-03a-pause-label.png', fullPage: true })
})

test('Now Playing Play button is labelled "Play" when paused', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-play-label')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAUSED_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  // Scope to playback controls group to avoid ambiguity with other buttons
  const controls = page.getByRole('group', { name: 'Playback controls' })
  await expect(controls.getByRole('button', { name: 'Play', exact: true })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-now-playing-03b-play-label.png', fullPage: true })
})

// ── Test (d): View queue button is visible ────────────────────────────────────

test('Now Playing tab shows View queue button', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-queue-btn')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  const viewQueueBtn = page.getByRole('button', { name: 'View playback queue' })
  await expect(viewQueueBtn).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-now-playing-04-queue-btn.png', fullPage: true })
})

// ── Test (e): Queue modal opens when View queue is clicked ────────────────────

test('Queue modal opens when View queue button is clicked', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-queue-modal-open')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )
  await page.route('**/api/sonos/queue/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUEUE_ITEMS) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'View playback queue' }).click()

  const dialog = page.getByRole('dialog', { name: 'Queue' })
  await expect(dialog).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-now-playing-05-queue-modal-open.png', fullPage: true })
})

// ── Test (f): Queue modal shows track titles ──────────────────────────────────

test('Queue modal shows track titles from mocked queue', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-queue-tracks')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )
  await page.route('**/api/sonos/queue/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUEUE_ITEMS) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'View playback queue' }).click()

  const dialog = page.getByRole('dialog', { name: 'Queue' })
  await expect(dialog).toBeVisible()

  // Both queue items should be visible
  await expect(dialog.getByText('Karma Police')).toBeVisible()
  await expect(dialog.getByText('No Surprises')).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-now-playing-06-queue-tracks.png', fullPage: true })
})

// ── Test (g): Queue modal can be closed with Cancel ──────────────────────────

test('Queue modal can be closed with Cancel button', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-queue-close')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAYING_NOW_PLAYING) }),
  )
  await page.route('**/api/sonos/queue/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(QUEUE_ITEMS) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'View playback queue' }).click()

  const dialog = page.getByRole('dialog', { name: 'Queue' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Cancel' }).click()

  // The SortableOverlay slides the panel off-screen with translate-y-full (CSS animation).
  // The dialog element stays in the DOM but moves off-screen — verify it no longer has
  // the open class (translate-y-0) and instead has translate-y-full.
  await expect(dialog).not.toHaveClass(/translate-y-0/)

  await page.screenshot({ path: '.testing/results/sonos-now-playing-07-queue-closed.png', fullPage: true })
})

// ── Test (h): Empty state shows "Nothing playing" when stopped ────────────────

test('Now Playing shows "Nothing playing" heading when speaker is stopped', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-empty')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('heading', { name: 'Nothing playing' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-now-playing-08-empty.png', fullPage: true })
})

// ── Test (i): Error state shows "Cannot reach this speaker" ──────────────────

test('Now Playing shows error heading when API returns error entry', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-error')

  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ERROR_NOW_PLAYING) }),
  )

  await page.goto('/sonos')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('heading', { name: 'Cannot reach this speaker' })).toBeVisible()

  await page.screenshot({ path: '.testing/results/sonos-now-playing-09-error.png', fullPage: true })
})

// ── Test (j): Loading state — skeletons visible before response arrives ───────

test('Now Playing shows skeleton loading state before data arrives', async ({ page }) => {
  test.setTimeout(30_000)
  collectConsoleErrors(page, 'NowPlaying-loading')

  await mockSession(page)

  // Route intercepts without fulfilling so the request hangs — gives us loading state
  await page.route('**/api/sonos/now-playing', () => {
    // Intentionally never fulfill — leaves the request pending
  })

  await page.goto('/sonos')
  // Do NOT wait for networkidle — check skeleton state before response

  // Skeletons are rendered as divs (no specific aria-label on container)
  // Verify that the loading skeleton is present via the animate-pulse class
  const skeleton = page.locator('.animate-pulse').first()
  await expect(skeleton).toBeVisible({ timeout: 5_000 })

  await page.screenshot({ path: '.testing/results/sonos-now-playing-10-loading.png', fullPage: true })
})
