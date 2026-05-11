import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  spotifyClient,
  SpotifyApiError,
  fetchPublicPlaylistMetadata,
  parsePlaylistInput,
  type SpotifyArtist,
} from '../lib/spotify-client.js'
import { musicBrainzClient, type ArtistCountryRow } from '../lib/musicbrainz-client.js'
import { db } from '../db/index.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function handleError(res: Response, err: unknown): void {
  if (err instanceof SpotifyApiError) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500
    res.status(status).json({ error: err.message })
    return
  }
  const msg = err instanceof Error ? err.message : String(err)
  res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
}

// GET /spotify/auth — initiate OAuth flow (no auth required, this starts the login)
router.get('/auth', (_req: Request, res: Response) => {
  if (!spotifyClient.isConfigured()) {
    res.status(503).json({ error: 'Spotify is not configured — set Client ID and Client Secret in Settings' })
    return
  }
  try {
    const authUrl = spotifyClient.getAuthUrl()
    res.redirect(authUrl)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/callback — handle OAuth redirect (no auth required, called by Spotify)
router.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined
  if (!code) {
    res.status(400).json({ error: 'Missing authorization code' })
    return
  }
  try {
    await spotifyClient.handleCallback(code)
    // Redirect to frontend settings page after successful OAuth
    res.redirect('/settings?spotify=connected')
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/status — check if Spotify is connected (requires auth)
router.get('/status', requireAuth, async (_req: Request, res: Response) => {
  try {
    const status = await spotifyClient.getStatus()
    const needs_reauth = spotifyClient.isConnected() && !spotifyClient.hasWriteScope()
    res.json({ ...status, needs_reauth })
  } catch (err) {
    handleError(res, err)
  }
})

// POST /spotify/disconnect — remove stored tokens (requires auth)
router.post('/disconnect', requireAuth, (_req: Request, res: Response) => {
  try {
    spotifyClient.disconnect()
    res.json({ ok: true })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/playlists — fetch user's playlists (requires auth + Spotify connected)
router.get('/playlists', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getPlaylists(limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/playlists/:id/tracks — fetch tracks in a playlist (requires auth + connected)
router.get('/playlists/:id/tracks', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getPlaylistTracks(String(req.params.id), limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// POST /spotify/playlists/:id/tracks — add a track to a playlist (requires auth + connected + write scope)
router.post('/playlists/:id/tracks', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  if (!spotifyClient.hasWriteScope()) {
    res.status(403).json({ error: 'Playlist write access not granted — reconnect Spotify in Settings' })
    return
  }
  const { uri } = req.body ?? {}
  if (!uri || typeof uri !== 'string') {
    res.status(400).json({ error: 'uri is required' })
    return
  }
  try {
    await spotifyClient.addTrackToPlaylist(String(req.params.id), uri)
    res.json({ success: true })
  } catch (err) {
    handleError(res, err)
  }
})

// POST /spotify/playlists — create a new Spotify playlist (requires auth + connected + write scope)
router.post('/playlists', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  if (!spotifyClient.hasWriteScope()) {
    res.status(403).json({ error: 'Playlist write access not granted — reconnect Spotify in Settings' })
    return
  }
  const { name } = req.body ?? {}
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' })
    return
  }
  try {
    const result = await spotifyClient.createPlaylist(name.trim())
    res.status(201).json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// ── Pinned playlists ────────────────────────────────────────────────────────
// Lets users "pin" any Spotify playlist by pasting its share URL. Used to
// surface playlists the Web API won't return (Discover Weekly, Release Radar,
// Daily Mix, Today's Top Hits — all blocked for third-party apps since the
// Spotify Web API changes of 27 Nov 2024), and as a user-controlled quick-
// access shelf for favourites.

interface PinnedPlaylistRow {
  id: number
  user_id: string
  playlist_id: string
  uri: string
  name: string
  image_url: string | null
  owner_display_name: string | null
  owner_id: string | null
  track_total: number | null
  is_editorial: number
  sort_order: number
  created_at: string
}

function rowToPinned(row: PinnedPlaylistRow) {
  return {
    id: row.id,
    playlist_id: row.playlist_id,
    uri: row.uri,
    name: row.name,
    image_url: row.image_url,
    owner_display_name: row.owner_display_name,
    owner_id: row.owner_id,
    track_total: row.track_total,
    is_editorial: row.is_editorial === 1,
    sort_order: row.sort_order,
    created_at: row.created_at,
  }
}

// GET /spotify/pinned — list the user's pinned Spotify playlists
router.get('/pinned', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id
    const rows = db
      .prepare(
        'SELECT * FROM spotify_pinned_playlists WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC',
      )
      .all(userId) as PinnedPlaylistRow[]
    res.json(rows.map(rowToPinned))
  } catch (err) {
    handleError(res, err)
  }
})

const pinSchema = z.object({
  input: z.string().min(1, 'Paste a Spotify playlist URL'),
})

// POST /spotify/pinned — pin a playlist by URL / URI / ID
router.post('/pinned', requireAuth, async (req: Request, res: Response) => {
  const parsed = pinSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message })
    return
  }
  const playlistId = parsePlaylistInput(parsed.data.input)
  if (!playlistId) {
    res.status(400).json({ error: "That doesn't look like a Spotify playlist link. Try the Share → Copy link option in Spotify." })
    return
  }

  try {
    const userId = (req as any).user.id

    // Already pinned? Return it.
    const existing = db
      .prepare('SELECT * FROM spotify_pinned_playlists WHERE user_id = ? AND playlist_id = ?')
      .get(userId, playlistId) as PinnedPlaylistRow | undefined
    if (existing) {
      res.status(200).json(rowToPinned(existing))
      return
    }

    // Try the Web API first — works for user-owned/followed playlists
    let name: string | null = null
    let image: string | null = null
    let ownerName: string | null = null
    let ownerId: string | null = null
    let trackTotal: number | null = null
    let isEditorial = false

    if (spotifyClient.isConnected()) {
      try {
        const pl = await spotifyClient.getPlaylist(playlistId)
        name = pl.name
        image = pl.images?.[0]?.url ?? null
        ownerName = pl.owner?.display_name ?? null
        ownerId = pl.owner?.id ?? null
        trackTotal = pl.tracks?.total ?? null
      } catch (err) {
        // Fall through to OG scrape
        if (err instanceof SpotifyApiError && err.status !== 404) {
          // A real API error — still try OG scrape, since editorial playlists also 404
        }
      }
    }

    // Fallback / supplement: OG scrape (works for editorial playlists + unauthenticated)
    if (!name || !image) {
      const og = await fetchPublicPlaylistMetadata(playlistId)
      if (og) {
        name = name ?? og.name
        image = image ?? og.image_url
        ownerName = ownerName ?? og.owner_display_name
        trackTotal = trackTotal ?? og.track_total
        // If the OG description says "Playlist · Spotify · ..." the owner is
        // Spotify itself, meaning this is an editorial/algorithmic playlist.
        if (
          (og.owner_display_name ?? '').trim().toLowerCase() === 'spotify' &&
          !ownerId
        ) {
          ownerId = 'spotify'
          isEditorial = true
        }
      }
    }

    if (ownerId === 'spotify') isEditorial = true

    if (!name) {
      res.status(404).json({
        error: "Couldn't find that playlist — check the link is correct and the playlist is public.",
      })
      return
    }

    const maxRow = db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM spotify_pinned_playlists WHERE user_id = ?',
      )
      .get(userId) as { max_order: number }
    const nextOrder = maxRow.max_order + 1

    const result = db
      .prepare(
        `INSERT INTO spotify_pinned_playlists
           (user_id, playlist_id, uri, name, image_url, owner_display_name, owner_id, track_total, is_editorial, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        playlistId,
        `spotify:playlist:${playlistId}`,
        name,
        image,
        ownerName,
        ownerId,
        trackTotal,
        isEditorial ? 1 : 0,
        nextOrder,
      )

    const created = db
      .prepare('SELECT * FROM spotify_pinned_playlists WHERE id = ?')
      .get(result.lastInsertRowid) as PinnedPlaylistRow
    res.status(201).json(rowToPinned(created))
  } catch (err) {
    handleError(res, err)
  }
})

// DELETE /spotify/pinned/:playlist_id — unpin a playlist for the current user
router.delete('/pinned/:playlist_id', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id
    const playlistId = String(req.params.playlist_id)
    const result = db
      .prepare('DELETE FROM spotify_pinned_playlists WHERE user_id = ? AND playlist_id = ?')
      .run(userId, playlistId)
    if (result.changes === 0) {
      res.status(404).json({ error: 'Not pinned' })
      return
    }
    res.status(204).send()
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/playlists/:id/metadata — resolve playlist metadata with fallback.
// Tries the Web API first (works for user-owned/followed) and, on failure,
// falls back to scraping the public open.spotify.com share page. This lets the
// detail page render a cheeky "Spotify won't let us show the tracks" state for
// editorial playlists while still offering Play/Queue/Play next.
router.get('/playlists/:id/metadata', requireAuth, async (req: Request, res: Response) => {
  const playlistId = String(req.params.id)
  try {
    if (spotifyClient.isConnected()) {
      try {
        const pl = await spotifyClient.getPlaylist(playlistId)
        res.json({
          playlist_id: pl.id,
          uri: pl.uri,
          name: pl.name,
          image_url: pl.images?.[0]?.url ?? null,
          owner_display_name: pl.owner?.display_name ?? null,
          owner_id: pl.owner?.id ?? null,
          track_total: pl.tracks?.total ?? null,
          is_editorial: pl.owner?.id === 'spotify',
          via: 'api',
        })
        return
      } catch (err) {
        if (!(err instanceof SpotifyApiError) || err.status !== 404) {
          throw err
        }
        // 404 from Spotify API — likely an editorial playlist. Fall through.
      }
    }
    const og = await fetchPublicPlaylistMetadata(playlistId)
    if (!og) {
      res.status(404).json({ error: 'Playlist not found' })
      return
    }
    const ownerIsSpotify =
      (og.owner_display_name ?? '').trim().toLowerCase() === 'spotify'
    res.json({
      playlist_id: playlistId,
      uri: `spotify:playlist:${playlistId}`,
      name: og.name,
      image_url: og.image_url,
      owner_display_name: og.owner_display_name,
      owner_id: ownerIsSpotify ? 'spotify' : null,
      track_total: og.track_total,
      is_editorial: ownerIsSpotify,
      via: 'og',
    })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/albums — fetch user's saved albums (requires auth + connected)
router.get('/albums', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getSavedAlbums(limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/albums/:id/tracks — fetch tracks in an album (requires auth + connected)
router.get('/albums/:id/tracks', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getAlbumTracks(String(req.params.id), limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/shows — fetch user's saved podcasts (requires auth + connected)
router.get('/shows', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getSavedShows(limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/shows/:id/episodes — fetch episodes of a show (requires auth + connected)
router.get('/shows/:id/episodes', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getShowEpisodes(String(req.params.id), limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/tracks — fetch user's saved/liked tracks (requires auth + connected)
router.get('/tracks', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getSavedTracks(limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/search?q= — search Spotify catalogue (requires auth + connected)
router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const q = req.query.q as string | undefined
  if (!q) {
    res.status(400).json({ error: 'Missing required query parameter: q' })
    return
  }
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const rawTypes = req.query.types as string | undefined
    const types = rawTypes
      ? (rawTypes.split(',').filter(t => ['track', 'playlist', 'album', 'artist'].includes(t)) as Array<'track' | 'playlist' | 'album' | 'artist'>)
      : undefined
    const limit = req.query.limit ? Number(req.query.limit) : 20
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.search(q, types, limit, offset)
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/artists — fetch followed + top artists merged (requires auth + connected)
router.get('/artists', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  const artists: SpotifyArtist[] = []
  const seenIds = new Set<string>()
  let scope_warning: string | undefined

  try {
    const followed = await spotifyClient.getFollowedArtists(50)
    for (const a of followed.artists.items) {
      if (!seenIds.has(a.id)) {
        seenIds.add(a.id)
        artists.push(a)
      }
    }
  } catch (err) {
    if (err instanceof SpotifyApiError && err.status === 403) {
      scope_warning = 'Followed artists unavailable — re-authenticate Spotify to grant the user-follow-read scope.'
    } else {
      // Non-scope error: propagate
      handleError(res, err)
      return
    }
  }

  try {
    const top = await spotifyClient.getTopArtists(50)
    for (const a of top.items) {
      if (!seenIds.has(a.id)) {
        seenIds.add(a.id)
        artists.push(a)
      }
    }
  } catch (err) {
    if (err instanceof SpotifyApiError && err.status === 403) {
      const topWarning = 'Top artists unavailable — re-authenticate Spotify to grant the user-top-read scope.'
      scope_warning = scope_warning ? `${scope_warning} ${topWarning}` : topWarning
    } else {
      handleError(res, err)
      return
    }
  }

  artists.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const result: { items: SpotifyArtist[]; total: number; scope_warning?: string } = {
    items: artists,
    total: artists.length,
  }
  if (scope_warning) result.scope_warning = scope_warning
  res.json(result)
})

// GET /spotify/artists/:id — fetch a single artist by Spotify ID (requires auth + connected)
router.get('/artists/:id', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const artistId = String(req.params.id)
    const artist = await spotifyClient.getArtist(artistId)
    res.json(artist)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/artists/:id/albums — fetch albums for an artist (requires auth + connected)
router.get('/artists/:id/albums', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    let artistId = String(req.params.id)

    // NAS-sourced artists have IDs like "nas:Artist Name" — resolve to a real Spotify ID via search
    if (artistId.startsWith('nas:')) {
      const name = artistId.slice(4)
      const searchResult = await spotifyClient.search(name, ['artist'], 1)
      const match = searchResult.artists?.items?.[0]
      if (match) {
        artistId = match.id
      } else {
        res.json({ items: [], total: 0, next: null })
        return
      }
    }

    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const result = await spotifyClient.getArtistAlbums(artistId, limit, offset)

    // Filter to albums where this artist is the primary (first-listed) artist
    // This removes compilations, "appears on", and feature albums
    const filtered = result.items.filter(album =>
      album.artists.length > 0 && album.artists[0].id === artistId,
    )

    res.json({ ...result, items: filtered, total: filtered.length })
  } catch (err) {
    handleError(res, err)
  }
})

// ── Artist Country Enrichment ────────────────────────────────────────────────

// POST /spotify/enrich-artists — kick off background enrichment for uncached artists
router.post('/enrich-artists', requireAuth, async (req: Request, res: Response) => {
  const progress = musicBrainzClient.getProgress()
  if (progress.status === 'running') {
    res.json({ ...progress, status: 'already_running' })
    return
  }

  try {
    let artists: Array<{ id: string; name: string }> = []

    if (req.body?.artist_ids?.length) {
      artists = req.body.artist_ids
    } else if (spotifyClient.isConnected()) {
      // Collect all unique artists from saved albums
      const seenIds = new Set<string>()
      let offset = 0
      const limit = 50
      let hasMore = true

      while (hasMore) {
        const page = await spotifyClient.getSavedAlbums(limit, offset)
        for (const item of page.items) {
          for (const artist of item.album.artists) {
            if (!seenIds.has(artist.id)) {
              seenIds.add(artist.id)
              artists.push({ id: artist.id, name: artist.name })
            }
          }
        }
        offset += limit
        hasMore = page.next !== null && page.items.length === limit
      }
    }

    if (artists.length === 0) {
      res.json({ status: 'no_artists', total: 0 })
      return
    }

    // Run enrichment in background (don't await)
    musicBrainzClient.enrichArtists(artists).catch(err => {
      console.error('[Enrichment] Background enrichment error:', err instanceof Error ? err.message : String(err))
    })

    res.json({ status: 'started', total: artists.length })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/enrichment-status — check enrichment progress
router.get('/enrichment-status', requireAuth, (_req: Request, res: Response) => {
  res.json(musicBrainzClient.getProgress())
})

// POST /spotify/enrich-artists/cancel — cancel running enrichment
router.post('/enrich-artists/cancel', requireAuth, (_req: Request, res: Response) => {
  musicBrainzClient.cancel()
  res.json({ ok: true })
})

// POST /spotify/backfill-images — populate image_url for all enriched artists
router.post('/backfill-images', requireAuth, async (_req: Request, res: Response) => {
  try {
    if (!spotifyClient.isConnected()) {
      res.status(401).json({ error: 'Spotify not connected' })
      return
    }

    // Backfill Spotify artists (fast — batch API, no rate limit)
    const spotifyResult = await musicBrainzClient.backfillImages(spotifyClient)

    // Backfill NAS artists (slow — MusicBrainz rate limited at 1 req/sec)
    const nasResult = await musicBrainzClient.backfillNasImages(spotifyClient)

    res.json({
      spotify: spotifyResult,
      nas: nasResult,
      total_updated: spotifyResult.updated + nasResult.updated,
    })
  } catch (err) {
    handleError(res, err)
  }
})

// ── Auto-backfill: lazily fetch missing artist images in background ──────────

let imageBackfillRunning = false

function triggerAutoBackfill(): void {
  if (imageBackfillRunning) return
  if (!spotifyClient.isConnected()) return

  // Check if there are artists missing images
  const missing = db.prepare(
    "SELECT COUNT(*) as cnt FROM artist_countries WHERE image_url IS NULL AND spotify_artist_id NOT LIKE 'nas:%'",
  ).get() as { cnt: number }
  if (missing.cnt === 0) return

  imageBackfillRunning = true
  console.log(`[Backfill] Auto-fetching images for ${missing.cnt} artists...`)

  musicBrainzClient.backfillImages(spotifyClient)
    .then(result => {
      console.log(`[Backfill] Spotify images: ${result.updated}/${result.total} updated`)
      // Also try NAS artists (slower, but runs in background)
      return musicBrainzClient.backfillNasImages(spotifyClient)
    })
    .then(result => {
      console.log(`[Backfill] NAS images: ${result.updated}/${result.total} updated`)
    })
    .catch(err => {
      console.error('[Backfill] Auto-backfill failed:', err instanceof Error ? err.message : String(err))
    })
    .finally(() => {
      imageBackfillRunning = false
    })
}

// GET /spotify/artist-countries — get all cached artist country data
router.get('/artist-countries', requireAuth, (_req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM artist_countries ORDER BY artist_name COLLATE NOCASE').all() as ArtistCountryRow[]
    res.json({ items: rows, total: rows.length })
    // Fire-and-forget: backfill missing images in background
    triggerAutoBackfill()
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/artist-countries/:id — get country for a specific artist
router.get('/artist-countries/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM artist_countries WHERE spotify_artist_id = ?').get(String(req.params.id)) as ArtistCountryRow | undefined
    if (!row) {
      res.status(404).json({ error: 'Artist country data not found' })
      return
    }
    res.json(row)
  } catch (err) {
    handleError(res, err)
  }
})

// PUT /spotify/artist-countries/:id — manual override
router.put('/artist-countries/:id', requireAuth, (req: Request, res: Response) => {
  const { country_code, country_name, sub_region } = req.body ?? {}
  if (!country_code || !country_name) {
    res.status(400).json({ error: 'country_code and country_name are required' })
    return
  }
  try {
    const existing = db.prepare('SELECT spotify_artist_id, artist_name FROM artist_countries WHERE spotify_artist_id = ?')
      .get(String(req.params.id)) as { spotify_artist_id: string; artist_name: string } | undefined

    if (existing) {
      db.prepare(`
        UPDATE artist_countries
        SET country_code = ?, country_name = ?, sub_region = ?, source = 'manual', confidence = 'high', updated_at = datetime('now')
        WHERE spotify_artist_id = ?
      `).run(country_code, country_name, sub_region ?? null, String(req.params.id))
    } else {
      db.prepare(`
        INSERT INTO artist_countries (spotify_artist_id, artist_name, country_code, country_name, sub_region, source, confidence)
        VALUES (?, ?, ?, ?, ?, 'manual', 'high')
      `).run(String(req.params.id), req.body.artist_name ?? 'Unknown', country_code, country_name, sub_region ?? null)
    }

    const updated = db.prepare('SELECT * FROM artist_countries WHERE spotify_artist_id = ?').get(String(req.params.id))
    res.json(updated)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /spotify/albums/enriched — saved albums with country data joined
router.get('/albums/enriched', requireAuth, async (req: Request, res: Response) => {
  if (!spotifyClient.isConnected()) {
    res.status(401).json({ error: 'Spotify not connected' })
    return
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    const offset = req.query.offset ? Number(req.query.offset) : 0
    const albumData = await spotifyClient.getSavedAlbums(limit, offset)

    // Collect all unique artist IDs
    const artistIds = new Set<string>()
    for (const item of albumData.items) {
      for (const artist of item.album.artists) {
        artistIds.add(artist.id)
      }
    }

    // Batch-fetch country data from cache
    const countryMap = new Map<string, ArtistCountryRow>()
    if (artistIds.size > 0) {
      const placeholders = Array.from(artistIds).map(() => '?').join(',')
      const rows = db.prepare(
        `SELECT * FROM artist_countries WHERE spotify_artist_id IN (${placeholders})`,
      ).all(...artistIds) as ArtistCountryRow[]
      for (const row of rows) {
        countryMap.set(row.spotify_artist_id, row)
      }
    }

    // Enrich albums with country data
    const enrichedItems = albumData.items.map(item => ({
      ...item,
      artist_countries: item.album.artists.map(a => {
        const c = countryMap.get(a.id)
        return {
          artist_id: a.id,
          artist_name: a.name,
          country_code: c?.country_code ?? null,
          country_name: c?.country_name ?? null,
          sub_region: c?.sub_region ?? null,
          confidence: c?.confidence ?? null,
          image_url: c?.image_url ?? null,
        }
      }),
    }))

    res.json({
      items: enrichedItems,
      total: albumData.total,
      next: albumData.next,
      cached_artists: countryMap.size,
      uncached_artists: artistIds.size - countryMap.size,
    })
    // Fire-and-forget: backfill missing images in background
    triggerAutoBackfill()
  } catch (err) {
    handleError(res, err)
  }
})

export default router
