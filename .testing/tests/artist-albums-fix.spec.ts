import { test, expect, type Page } from '@playwright/test'

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

const SPOTIFY_CONNECTED = { connected: true, display_name: 'testuser' }

const MOCK_ARTIST_COUNTRIES = {
  items: [
    {
      spotify_artist_id: '3gd8FJtBJtkRxdfbTu19U2',
      artist_name: 'Mumford & Sons',
      country_code: 'GB',
      country_name: 'United Kingdom',
      sub_region: 'London',
      image_url: null,
      source: 'musicbrainz',
      confidence: 'high',
    },
    {
      spotify_artist_id: 'nas:A$AP Rocky',
      artist_name: 'A$AP Rocky',
      country_code: 'US',
      country_name: 'United States',
      sub_region: 'New York',
      image_url: null,
      source: 'musicbrainz',
      confidence: 'medium',
    },
  ],
  total: 2,
}

const MOCK_ARTISTS = {
  items: [
    {
      id: '3gd8FJtBJtkRxdfbTu19U2',
      name: 'Mumford & Sons',
      images: [{ url: 'https://example.com/mumford.jpg', height: 300, width: 300 }],
      genres: ['folk rock'],
      uri: 'spotify:artist:3gd8FJtBJtkRxdfbTu19U2',
      external_urls: { spotify: 'https://open.spotify.com/artist/3gd8FJtBJtkRxdfbTu19U2' },
      followers: { total: 5000000 },
    },
  ],
  total: 1,
}

const MOCK_ALBUMS = {
  items: [
    {
      id: 'album1',
      name: 'Sigh No More',
      album_type: 'album',
      images: [{ url: 'https://example.com/sigh.jpg', height: 300, width: 300 }],
      artists: [{ id: '3gd8FJtBJtkRxdfbTu19U2', name: 'Mumford & Sons' }],
      uri: 'spotify:album:album1',
      external_urls: { spotify: 'https://open.spotify.com/album/album1' },
      release_date: '2009-10-02',
      total_tracks: 12,
    },
    {
      id: 'album2',
      name: 'Babel',
      album_type: 'album',
      images: [{ url: 'https://example.com/babel.jpg', height: 300, width: 300 }],
      artists: [{ id: '3gd8FJtBJtkRxdfbTu19U2', name: 'Mumford & Sons' }],
      uri: 'spotify:album:album2',
      external_urls: { spotify: 'https://open.spotify.com/album/album2' },
      release_date: '2012-09-21',
      total_tracks: 12,
    },
  ],
  total: 2,
  next: null,
}

const MOCK_NAS_SEARCH_RESULT = {
  artists: {
    items: [
      {
        id: '1A2GTWGtFfWp7KSQTwWOyo',
        name: 'A$AP Rocky',
        images: [{ url: 'https://example.com/asap.jpg', height: 300, width: 300 }],
        genres: ['hip hop'],
        uri: 'spotify:artist:1A2GTWGtFfWp7KSQTwWOyo',
        external_urls: { spotify: 'https://open.spotify.com/artist/1A2GTWGtFfWp7KSQTwWOyo' },
        followers: { total: 10000000 },
      },
    ],
    total: 1,
    next: null,
    offset: 0,
    limit: 1,
  },
}

const MOCK_NAS_ALBUMS = {
  items: [
    {
      id: 'nas-album1',
      name: 'LONG.LIVE.A$AP',
      album_type: 'album',
      images: [{ url: 'https://example.com/longlive.jpg', height: 300, width: 300 }],
      artists: [{ id: '1A2GTWGtFfWp7KSQTwWOyo', name: 'A$AP Rocky' }],
      uri: 'spotify:album:nas-album1',
      external_urls: { spotify: 'https://open.spotify.com/album/nas-album1' },
      release_date: '2013-01-15',
      total_tracks: 16,
    },
  ],
  total: 1,
  next: null,
}

async function setupCommonRoutes(page: Page) {
  await mockSession(page)

  await page.route('**/api/sonos/now-playing', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STOPPED_NOW_PLAYING) }),
  )
  await page.route('**/api/spotify/status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOTIFY_CONNECTED) }),
  )
  await page.route('**/api/sonos/library/genres', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  await page.route('**/api/sonos/radio/stations', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  await page.route('**/api/spotify/artist-countries', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTIST_COUNTRIES) }),
  )
  await page.route('**/api/sonos/zones', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  await page.route('**/api/spotify/enrichment-status', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'idle' }) }),
  )
  // Match /artists but NOT /artists/<id>/albums (let those fall through to specific mocks)
  await page.route(/\/api\/spotify\/artists(\?|$)/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ARTISTS) }),
  )
}

async function navigateToCountries(page: Page) {
  await page.goto('/sonos/browse')
  await page.waitForLoadState('networkidle')
  // Switch to Spotify source
  await page.getByRole('tablist', { name: 'Browse by source' }).getByRole('tab', { name: 'Spotify' }).click()
  await page.waitForLoadState('networkidle')
  // Click the Countries pill/tab within Spotify browse
  await page.getByRole('tab', { name: /Countries/i }).click()
  await page.waitForLoadState('networkidle')
}

// ── Test: Spotify artist (real ID) loads albums correctly ────────────────────

test('Country artist with Spotify ID loads albums page', async ({ page }) => {
  test.setTimeout(30_000)

  await setupCommonRoutes(page)

  // Mock the album fetch for the real Spotify artist
  await page.route(/\/api\/spotify\/artists\/3gd8FJtBJtkRxdfbTu19U2\/albums/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ALBUMS) }),
  )

  await navigateToCountries(page)
  // Find and click the United Kingdom country
  await page.getByText('United Kingdom').click()
  await page.waitForLoadState('networkidle')

  // Click Mumford & Sons artist
  await page.getByText('Mumford & Sons').click()
  await page.waitForLoadState('networkidle')

  // Albums should load — verify both album names appear
  await expect(page.getByText('Sigh No More')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Babel')).toBeVisible()

  await page.screenshot({ path: '.testing/results/artist-albums-01-spotify-artist.png', fullPage: true })
})

// ── Test: NAS artist (nas: prefix) resolves via search and loads albums ──────

test('Country artist with nas: prefix resolves via Spotify search and shows albums', async ({ page }) => {
  test.setTimeout(30_000)

  await setupCommonRoutes(page)

  // Mock album fetch — match either the nas:-encoded ID or the resolved Spotify ID
  await page.route(/\/api\/spotify\/artists\/.*\/albums/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_NAS_ALBUMS) }),
  )

  await navigateToCountries(page)

  // Find and click United States
  await page.getByText('United States').click()
  await page.waitForLoadState('networkidle')

  // Click A$AP Rocky
  await page.getByText('A$AP Rocky').click()
  await page.waitForLoadState('networkidle')

  // Albums should load — the backend resolves the nas: ID via search
  await expect(page.getByText('LONG.LIVE.A$AP')).toBeVisible({ timeout: 10_000 })

  await page.screenshot({ path: '.testing/results/artist-albums-02-nas-artist.png', fullPage: true })
})

// ── Test: NAS artist with no Spotify match shows empty state ────────────────

test('Country artist with nas: prefix and no Spotify match shows empty albums', async ({ page }) => {
  test.setTimeout(30_000)

  await setupCommonRoutes(page)

  // Override artist-countries to have a NAS-only artist that won't match on Spotify
  await page.route('**/api/spotify/artist-countries', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            spotify_artist_id: 'nas:Obscure Local Band',
            artist_name: 'Obscure Local Band',
            country_code: 'DE',
            country_name: 'Germany',
            sub_region: 'Berlin',
            image_url: null,
            source: 'musicbrainz',
            confidence: 'low',
          },
        ],
        total: 1,
      }),
    }),
  )

  // Backend returns empty albums (no Spotify match found via search)
  await page.route(/\/api\/spotify\/artists\/.*\/albums/, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, next: null }) }),
  )

  await navigateToCountries(page)

  await page.getByText('Germany').click()
  await page.waitForLoadState('networkidle')

  await page.getByText('Obscure Local Band').click()
  await page.waitForLoadState('networkidle')

  // Should not show an error — just empty or "no albums" state
  // The key assertion: no "Failed to fetch" error is displayed
  await expect(page.getByText(/Failed to fetch/i)).not.toBeVisible({ timeout: 5_000 })

  await page.screenshot({ path: '.testing/results/artist-albums-03-nas-no-match.png', fullPage: true })
})
