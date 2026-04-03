import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import axios from 'axios'
import { getAll, getOne, run } from '../db/index.js'
import { sonosClient } from '../lib/sonos-client.js'
import { sonosManager } from '../lib/sonos-manager.js'
import { emit } from '../lib/socket.js'
import { findPodcastFeedUrl, getLatestEpisodeUrl } from '../lib/podcast-resolver.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const SONOS_API_URL = process.env.SONOS_API_URL || 'http://localhost:3003'

const router = Router()

// ── Album art proxy helpers ───────────────────────────────────────────────────

const INTERNAL_IP_RE = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|localhost|127\.0\.0\.1)([\/:?]|$)/i

/**
 * Rewrite a Sonos albumArtUri so it can be fetched by the browser.
 * - Relative paths (starting with /) are made absolute using the Sonos HTTP API base URL
 * - Internal/private IP addresses are proxied through /api/sonos/art-proxy
 * - External HTTP URLs are also proxied to avoid mixed-content browser blocks
 * - External HTTPS URLs are returned unchanged
 */
function rewriteAlbumArtUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined

  // Relative path from node-sonos-http-api — make absolute using the API base URL
  if (uri.startsWith('/')) {
    const absolute = `${SONOS_API_URL}${uri}`
    return `/api/sonos/art-proxy?url=${encodeURIComponent(absolute)}`
  }

  // Internal/private IP or localhost — must proxy
  if (INTERNAL_IP_RE.test(uri)) {
    return `/api/sonos/art-proxy?url=${encodeURIComponent(uri)}`
  }

  // External HTTP — proxy to avoid mixed-content blocks in HTTPS deployments
  if (uri.startsWith('http://')) {
    return `/api/sonos/art-proxy?url=${encodeURIComponent(uri)}`
  }

  // External HTTPS CDN — return as-is
  return uri
}

// GET /art-proxy — server-side proxy for album art images from internal Sonos IPs
router.get('/art-proxy', async (req: Request, res: Response) => {
  const rawUrl = req.query.url
  const url = typeof rawUrl === 'string' ? rawUrl : undefined

  if (!url) {
    res.status(400).json({ error: 'Missing required query parameter: url' })
    return
  }

  // Only allow http/https schemes
  if (!/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'Invalid URL scheme — only http and https are permitted' })
    return
  }

  try {
    const upstream = await axios.get<Buffer>(url, {
      responseType: 'arraybuffer',
      timeout: 8000,
      // Don't throw on non-2xx so we can surface a clean error
      validateStatus: status => status < 500,
    })

    if (upstream.status >= 400) {
      res.status(502).json({ error: `Upstream returned ${upstream.status}` })
      return
    }

    const contentType = upstream.headers['content-type'] as string | undefined
    res.set('Content-Type', contentType || 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=3600')
    res.send(upstream.data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(502).json({ error: IS_PRODUCTION ? 'Failed to fetch album art' : msg })
  }
})

// Cache favourites for 5 minutes
let favouritesCache: { data: unknown[]; fetchedAt: number } | null = null
const FAVOURITES_CACHE_TTL = 5 * 60 * 1000

// GET /zones — list all Sonos speakers/groups
router.get('/zones', async (_req: Request, res: Response) => {
  try {
    const zones = await sonosClient.getZones()
    res.json(zones)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /state/:speaker — get playback state for a speaker
router.get('/state/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const state = await sonosClient.getState(speaker)
    // Inject cached podcast artwork when Sonos reports none
    if (!state.currentTrack.albumArtUri) {
      const podcastArt = sonosManager.getPodcastArt(speaker)
      if (podcastArt) state.currentTrack.albumArtUri = podcastArt
    }
    // Rewrite album art URL so the browser can reach it
    state.currentTrack.albumArtUri = rewriteAlbumArtUri(state.currentTrack.albumArtUri) ?? ''
    res.json(state)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /favourites — list Sonos Favourites (cached)
router.get('/favourites', async (_req: Request, res: Response) => {
  try {
    const now = Date.now()
    if (favouritesCache && now - favouritesCache.fetchedAt < FAVOURITES_CACHE_TTL) {
      res.json(favouritesCache.data)
      return
    }

    const favs = await sonosClient.getFavourites()
    favouritesCache = { data: favs, fetchedAt: now }
    res.json(favs)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /services — list music services the user has in their favourites
router.get('/services', async (_req: Request, res: Response) => {
  try {
    const services = await sonosClient.getUserServices()
    res.json(services)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /follow-me/status — get follow-me state
router.get('/follow-me/status', (_req: Request, res: Response) => {
  res.json(sonosManager.getFollowMeStatus())
})

// POST /follow-me/toggle — toggle global follow-me
const toggleSchema = z.object({ enabled: z.boolean() })

router.post('/follow-me/toggle', (req: Request, res: Response) => {
  try {
    const { enabled } = toggleSchema.parse(req.body)
    run(
      `INSERT INTO current_state (key, value, updated_at)
       VALUES ('pref_sonos_follow_me', ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [String(enabled)],
    )
    res.json({ enabled })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /speakers — list room-to-speaker mappings
router.get('/speakers', (_req: Request, res: Response) => {
  const speakers = getAll<{
    id: number
    room_name: string
    speaker_name: string
    favourite: string | null
    default_volume: number
    created_at: string
  }>('SELECT * FROM sonos_speakers ORDER BY room_name')
  res.json(speakers)
})

// POST /speakers — create/update a speaker mapping
const speakerSchema = z.object({
  room_name: z.string().min(1),
  speaker_name: z.string().min(1),
  favourite: z.string().nullable().optional(),
  default_volume: z.number().int().min(0).max(100).optional().default(25),
})

router.post('/speakers', (req: Request, res: Response) => {
  try {
    const data = speakerSchema.parse(req.body)
    run(
      `INSERT INTO sonos_speakers (room_name, speaker_name, favourite, default_volume)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(room_name) DO UPDATE SET
         speaker_name = excluded.speaker_name,
         favourite = excluded.favourite,
         default_volume = excluded.default_volume`,
      [data.room_name, data.speaker_name, data.favourite ?? null, data.default_volume],
    )
    sonosManager.refreshRoomSpeakerMap()
    const created = getOne('SELECT * FROM sonos_speakers WHERE room_name = ?', [data.room_name])
    res.json(created)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PUT /speakers/:room — update a speaker mapping
const speakerUpdateSchema = z.object({
  favourite: z.string().nullable().optional(),
  default_volume: z.number().int().min(0).max(100).optional(),
})

router.put('/speakers/:room', (req: Request, res: Response) => {
  try {
    const roomName = req.params.room
    const existing = getOne<{ id: number }>('SELECT id FROM sonos_speakers WHERE room_name = ?', [roomName])
    if (!existing) {
      res.status(404).json({ error: 'Speaker mapping not found' })
      return
    }

    const data = speakerUpdateSchema.parse(req.body)
    const updates: string[] = []
    const params: unknown[] = []

    if (data.favourite !== undefined) {
      updates.push('favourite = ?')
      params.push(data.favourite)
    }
    if (data.default_volume !== undefined) {
      updates.push('default_volume = ?')
      params.push(data.default_volume)
    }

    if (updates.length > 0) {
      params.push(roomName)
      run(`UPDATE sonos_speakers SET ${updates.join(', ')} WHERE room_name = ?`, params)
      sonosManager.refreshRoomSpeakerMap()
    }

    const updated = getOne('SELECT * FROM sonos_speakers WHERE room_name = ?', [roomName])
    res.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// DELETE /speakers/:room — remove a speaker mapping
router.delete('/speakers/:room', (req: Request, res: Response) => {
  const roomName = req.params.room
  const result = run('DELETE FROM sonos_speakers WHERE room_name = ?', [roomName])
  sonosManager.refreshRoomSpeakerMap()
  res.json({ deleted: result.changes > 0 })
})

// GET /auto-play — list auto-play rules
router.get('/auto-play', (_req: Request, res: Response) => {
  const rules = getAll(
    'SELECT * FROM sonos_auto_play ORDER BY mode_name, room_name',
  )
  res.json(rules)
})

// POST /auto-play — create a rule
const autoPlaySchema = z.object({
  room_name: z.string().nullable().optional(),
  mode_name: z.string().min(1),
  favourite_name: z.string().min(1),
  trigger_type: z.enum(['mode_change', 'if_not_playing', 'if_source_not']),
  trigger_value: z.string().nullable().optional(),
  enabled: z.union([z.boolean(), z.number()]).optional().default(true),
  max_plays: z.number().int().min(1).nullable().optional(),
  podcast_feed_url: z.string().url().nullable().optional(),
})

router.post('/auto-play', (req: Request, res: Response) => {
  try {
    const data = autoPlaySchema.parse(req.body)
    const result = run(
      `INSERT INTO sonos_auto_play (room_name, mode_name, favourite_name, trigger_type, trigger_value, enabled, max_plays, podcast_feed_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.room_name ?? null,
        data.mode_name,
        data.favourite_name,
        data.trigger_type,
        data.trigger_value ?? null,
        data.enabled ? 1 : 0,
        data.max_plays ?? null,
        data.podcast_feed_url ?? null,
      ],
    )
    const created = getOne('SELECT * FROM sonos_auto_play WHERE id = ?', [result.lastInsertRowid])
    res.status(201).json(created)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// PUT /auto-play/:id — update a rule
const autoPlayUpdateSchema = z.object({
  room_name: z.string().nullable().optional(),
  mode_name: z.string().min(1).optional(),
  favourite_name: z.string().min(1).optional(),
  trigger_type: z.enum(['mode_change', 'if_not_playing', 'if_source_not']).optional(),
  trigger_value: z.string().nullable().optional(),
  enabled: z.union([z.boolean(), z.number()]).optional(),
  max_plays: z.number().int().min(1).nullable().optional(),
  podcast_feed_url: z.string().url().nullable().optional(),
})

router.put('/auto-play/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    const existing = getOne<{ id: number }>('SELECT id FROM sonos_auto_play WHERE id = ?', [id])
    if (!existing) {
      res.status(404).json({ error: 'Auto-play rule not found' })
      return
    }

    const data = autoPlayUpdateSchema.parse(req.body)
    const updates: string[] = []
    const params: unknown[] = []

    if (data.room_name !== undefined) { updates.push('room_name = ?'); params.push(data.room_name) }
    if (data.mode_name !== undefined) { updates.push('mode_name = ?'); params.push(data.mode_name) }
    if (data.favourite_name !== undefined) { updates.push('favourite_name = ?'); params.push(data.favourite_name) }
    if (data.trigger_type !== undefined) { updates.push('trigger_type = ?'); params.push(data.trigger_type) }
    if (data.trigger_value !== undefined) { updates.push('trigger_value = ?'); params.push(data.trigger_value) }
    if (data.enabled !== undefined) { updates.push('enabled = ?'); params.push(data.enabled ? 1 : 0) }
    if (data.max_plays !== undefined) { updates.push('max_plays = ?'); params.push(data.max_plays) }
    if (data.podcast_feed_url !== undefined) { updates.push('podcast_feed_url = ?'); params.push(data.podcast_feed_url) }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')")
      params.push(id)
      run(`UPDATE sonos_auto_play SET ${updates.join(', ')} WHERE id = ?`, params)
    }

    const updated = getOne('SELECT * FROM sonos_auto_play WHERE id = ?', [id])
    res.json(updated)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// DELETE /auto-play/:id — delete a rule
router.delete('/auto-play/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const result = run('DELETE FROM sonos_auto_play WHERE id = ?', [id])
  res.json({ deleted: result.changes > 0 })
})

// POST /auto-play/resolve-podcast — detect if a favourite is a podcast and find its RSS feed
router.post('/auto-play/resolve-podcast', async (req: Request, res: Response) => {
  try {
    const { favourite_name } = z.object({ favourite_name: z.string().min(1) }).parse(req.body)

    // Check if this favourite is a podcast container
    const favourites = await sonosClient.getFavourites()
    const fav = favourites.find(f => f.title === favourite_name)
    const isPodcast = fav?.contentClass === 'object.container.podcast'

    if (!isPodcast) {
      res.json({ isPodcast: false, feedUrl: null })
      return
    }

    // Search iTunes for the RSS feed URL
    const podcast = await findPodcastFeedUrl(favourite_name)
    res.json({ isPodcast: true, feedUrl: podcast?.feedUrl ?? null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// ── Queue management ─────────────────────────────────────────────────────────

const addToQueueSchema = z.object({ uri: z.string().min(1) })
const playNextSchema = z.object({ uri: z.string().min(1) })
const reorderQueueSchema = z.object({ from: z.number().int().min(0), to: z.number().int().min(0) })

// GET /queue/:speaker — get current queue
router.get('/queue/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const queue = await sonosClient.getQueue(speaker)
    const items = queue.map(item => ({
      ...item,
      albumArtUri: rewriteAlbumArtUri(item.albumArtUri),
    }))
    res.json(items)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /queue/:speaker/add — add item to queue
router.post('/queue/:speaker/add', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const parsed = addToQueueSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' })
      return
    }
    await sonosClient.addToQueue(speaker, parsed.data.uri)
    emit('sonos:playback-update', { speaker })
    const queue = await sonosClient.getQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'add', queue })
    res.json({ speaker, action: 'add-to-queue' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /queue/:speaker/playnext — insert item as next track
router.post('/queue/:speaker/playnext', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const parsed = playNextSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' })
      return
    }
    await sonosClient.playNext(speaker, parsed.data.uri)
    emit('sonos:playback-update', { speaker })
    const queue = await sonosClient.getQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'playnext', queue })
    res.json({ speaker, action: 'play-next' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// DELETE /queue/:speaker/remove/:index — remove item from queue by index
router.delete('/queue/:speaker/remove/:index', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const rawIndex = Array.isArray(req.params.index) ? req.params.index[0] : req.params.index
    const index = parseInt(rawIndex, 10)
    if (isNaN(index) || index < 0) {
      res.status(400).json({ error: 'index must be a non-negative integer' })
      return
    }
    await sonosClient.removeFromQueue(speaker, index)
    emit('sonos:playback-update', { speaker })
    const queue = await sonosClient.getQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'remove', queue })
    res.json({ speaker, action: 'remove-from-queue', index })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /queue/:speaker/reorder — move item in queue
router.post('/queue/:speaker/reorder', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const parsed = reorderQueueSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' })
      return
    }
    await sonosClient.reorderQueue(speaker, parsed.data.from, parsed.data.to)
    emit('sonos:playback-update', { speaker })
    const queue = await sonosClient.getQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'reorder', queue })
    res.json({ speaker, action: 'reorder-queue', from: parsed.data.from, to: parsed.data.to })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// ── Genre browsing (via Sonos UPnP SOAP) ─────────────────────────────────────

// GET /library/genres — list all genres from the Sonos music library index
router.get('/library/genres', async (_req: Request, res: Response) => {
  try {
    const genres = await sonosClient.getGenres()
    res.json(genres)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /library/genre/:genre — list albums in a genre (with album art)
router.get('/library/genre/:genre', async (req: Request, res: Response) => {
  try {
    const genre = Array.isArray(req.params.genre) ? req.params.genre[0] : req.params.genre
    const albums = await sonosClient.getGenreAlbums(genre)
    // Proxy album art URIs through our art-proxy
    const result = albums.map(a => ({
      ...a,
      albumArtUri: rewriteAlbumArtUri(a.albumArtUri) ?? '',
    }))
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /library/genre-album-tracks?objectId= — list tracks in a genre album
router.get('/library/genre-album-tracks', async (req: Request, res: Response) => {
  const objectId = typeof req.query.objectId === 'string' ? req.query.objectId : ''
  if (!objectId) {
    res.status(400).json({ error: 'Missing required query parameter: objectId' })
    return
  }
  try {
    const tracks = await sonosClient.getGenreAlbumTracks(objectId)
    const result = tracks.map(t => ({
      ...t,
      albumArtUri: rewriteAlbumArtUri(t.albumArtUri) ?? '',
    }))
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// ── NAS library browsing (reads node-sonos-http-api cache) ───────────────────

// GET /library/status — check if library is loaded
router.get('/library/status', async (_req: Request, res: Response) => {
  try {
    const artists = sonosClient.getLibraryArtists()
    res.json({ available: artists.length > 0, artistCount: artists.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /library/reload — trigger library re-index
router.post('/library/reload', async (_req: Request, res: Response) => {
  try {
    const loaded = await sonosClient.ensureLibraryLoaded()
    res.json({ loaded })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /library/artists — list all artists
router.get('/library/artists', (_req: Request, res: Response) => {
  res.json(sonosClient.getLibraryArtists())
})

// GET /library/albums — list all albums (with artwork from Sonos UPnP)
router.get('/library/albums', async (_req: Request, res: Response) => {
  try {
    const albums = await sonosClient.browseAlbumsWithArt()
    res.json(albums.map(a => ({
      ...a,
      albumArtUri: rewriteAlbumArtUri(a.albumArtUri) ?? '',
    })))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /library/artist/:name — list tracks for an artist
router.get('/library/artist/:name', (req: Request, res: Response) => {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name
  res.json(sonosClient.getArtistTracks(name))
})

// GET /library/album-tracks?objectId= — list tracks for an album by UPnP objectId
router.get('/library/album-tracks', async (req: Request, res: Response) => {
  const objectId = typeof req.query.objectId === 'string' ? req.query.objectId : ''
  if (!objectId) {
    res.status(400).json({ error: 'Missing required query parameter: objectId' })
    return
  }
  try {
    const tracks = await sonosClient.browseAlbumTracks(objectId)
    res.json(tracks.map(t => ({
      ...t,
      albumArtUri: rewriteAlbumArtUri(t.albumArtUri) ?? '',
    })))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /library/search?q= — search the NAS library
router.get('/library/search', (req: Request, res: Response) => {
  const rawQ = req.query.q
  const q = typeof rawQ === 'string' ? rawQ.trim() : ''
  if (!q) {
    res.status(400).json({ error: 'Missing required query parameter: q' })
    return
  }
  res.json(sonosClient.searchLibrary(q))
})

// GET /radio/stations — list available radio stations
router.get('/radio/stations', async (_req: Request, res: Response) => {
  try {
    const stations = await sonosClient.getRadioStations()
    res.json(stations.map(s => ({ ...s, albumArtUri: s.albumArtUri ? rewriteAlbumArtUri(s.albumArtUri) : undefined })))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /play/:speaker — play/resume a speaker
router.post('/play/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    await sonosClient.play(speaker)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, action: 'play' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /pause/:speaker — pause a speaker
router.post('/pause/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    await sonosClient.pause(speaker)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, action: 'pause' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /stop/:speaker — stop a speaker
router.post('/stop/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    await sonosClient.stop(speaker)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, action: 'stop' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /next/:speaker — skip to next track
router.post('/next/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    await sonosClient.next(speaker)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, action: 'next' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /previous/:speaker — skip to previous track
router.post('/previous/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    await sonosClient.previous(speaker)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, action: 'previous' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /shuffle/:speaker — enable or disable shuffle
const shuffleSchema = z.object({ enabled: z.boolean() })

router.post('/shuffle/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { enabled } = shuffleSchema.parse(req.body)
    await sonosClient.shuffle(speaker, enabled)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, shuffle: enabled })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /repeat/:speaker — enable or disable repeat
const repeatSchema = z.object({ enabled: z.boolean() })

router.post('/repeat/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { enabled } = repeatSchema.parse(req.body)
    await sonosClient.repeat(speaker, enabled)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, repeat: enabled })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /seek/:speaker — seek to a position in seconds
const seekSchema = z.object({ seconds: z.number().int().min(0) })

router.post('/seek/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { seconds } = seekSchema.parse(req.body)
    await sonosClient.seek(speaker, seconds)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, seconds })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /play-favourite/:speaker — play a favourite by name on a specific speaker
const playFavouriteSchema = z.object({ name: z.string().min(1) })

router.post('/play-favourite/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { name } = playFavouriteSchema.parse(req.body)

    // Check if this favourite is a podcast container — if so, resolve the latest episode
    const favourites = favouritesCache ? favouritesCache.data : await sonosClient.getFavourites()
    const fav = (favourites as Array<{ title: string; contentClass?: string; albumArtURI?: string }>).find(f => f.title === name)

    if (fav?.contentClass === 'object.container.podcast') {
      const podcast = await findPodcastFeedUrl(name)
      if (!podcast) {
        res.status(502).json({ error: `Couldn't find podcast feed for "${name}". Check server logs for details.` })
        return
      }
      const episode = await getLatestEpisodeUrl(podcast.feedUrl)
      if (!episode) {
        res.status(502).json({ error: `Couldn't find latest episode for "${name}". Check server logs for details.` })
        return
      }
      // Cache artwork: prefer Sonos favourite's albumArtURI, fall back to iTunes artwork
      const artUrl = fav.albumArtURI ?? podcast.artworkUrl
      if (artUrl) sonosManager.setPodcastArt(speaker, artUrl)
      await sonosClient.setAVTransportURI(speaker, episode.url)
      await sonosClient.play(speaker)
      emit('sonos:playback-update', { speaker })
      res.json({ speaker, favourite: name, episode: episode.title })
      return
    }

    // Non-podcast favourite — clear any cached podcast art for this speaker
    sonosManager.clearPodcastArt(speaker)
    await sonosClient.playFavourite(speaker, name)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, favourite: name })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /play-all — play/resume all zone coordinators
router.post('/play-all', async (_req: Request, res: Response) => {
  try {
    const zones = sonosManager.getZones()
    const coordinators = zones.map(z => z.coordinator.roomName)
    await Promise.allSettled(coordinators.map(speaker => sonosClient.play(speaker)))
    emit('sonos:playback-update', { allPlaying: true })
    res.json({ action: 'play', affectedSpeakers: coordinators.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /pause-all — pause all zone coordinators
router.post('/pause-all', async (_req: Request, res: Response) => {
  try {
    const zones = sonosManager.getZones()
    const coordinators = zones.map(z => z.coordinator.roomName)
    await Promise.allSettled(coordinators.map(speaker => sonosClient.pause(speaker)))
    emit('sonos:playback-update', { allPaused: true })
    res.json({ action: 'pause', affectedSpeakers: coordinators.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /now-playing — aggregate playback state for all configured speakers
router.get('/now-playing', async (_req: Request, res: Response) => {
  try {
    const speakers = getAll<{ room_name: string; speaker_name: string }>('SELECT room_name, speaker_name FROM sonos_speakers ORDER BY room_name')

    // Build a map of speaker name → group info from the in-memory zone cache
    const zones = sonosManager.getZones()
    const groupMap = new Map<string, { coordinator: string; members: string[]; isCoordinator: boolean }>()
    for (const zone of zones) {
      const coordinatorName = zone.coordinator.roomName
      const memberNames = zone.members.map(m => m.roomName)
      // Only mark as grouped when there are multiple members
      if (memberNames.length > 1) {
        for (const member of zone.members) {
          groupMap.set(member.roomName, {
            coordinator: coordinatorName,
            members: memberNames,
            isCoordinator: member.roomName === coordinatorName,
          })
        }
      }
    }

    const results = await Promise.allSettled(
      speakers.map(async ({ room_name, speaker_name }) => {
        const state = await sonosClient.getState(speaker_name)
        // Inject cached podcast artwork when Sonos reports none
        if (!state.currentTrack.albumArtUri) {
          const podcastArt = sonosManager.getPodcastArt(speaker_name)
          if (podcastArt) state.currentTrack.albumArtUri = podcastArt
        }
        // Rewrite album art URL so the browser can reach it
        state.currentTrack.albumArtUri = rewriteAlbumArtUri(state.currentTrack.albumArtUri) ?? ''
        return { roomName: room_name, speakerName: speaker_name, state }
      }),
    )
    const nowPlaying = results.map((result, i) => {
      const speakerName = speakers[i].speaker_name
      const group = groupMap.get(speakerName) ?? null
      if (result.status === 'fulfilled') {
        return { ...result.value, group }
      }
      return {
        roomName: speakers[i].room_name,
        speakerName,
        state: null,
        error: true,
        group,
      }
    })
    res.json(nowPlaying)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// PUT /volume/:speaker — set live speaker volume
const volumeSchema = z.object({ level: z.number().int().min(0).max(100) })

router.put('/volume/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { level } = volumeSchema.parse(req.body)
    await sonosClient.setVolume(speaker, level)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, volume: level })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// PUT /mute/:speaker — mute or unmute a speaker
const muteSchema = z.object({ muted: z.boolean() })

router.put('/mute/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { muted } = muteSchema.parse(req.body)
    if (muted) {
      await sonosClient.mute(speaker)
    } else {
      await sonosClient.unmute(speaker)
    }
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, muted })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// PUT /mute-all — mute or unmute all zone coordinators
router.put('/mute-all', async (req: Request, res: Response) => {
  try {
    const { muted } = muteSchema.parse(req.body)
    const zones = sonosManager.getZones()
    const coordinators = zones.map(z => z.coordinator.roomName)
    await Promise.allSettled(
      coordinators.map(speaker =>
        muted ? sonosClient.groupMute(speaker) : sonosClient.groupUnmute(speaker),
      ),
    )
    emit('sonos:playback-update', { allMuted: muted })
    res.json({ muted, affectedSpeakers: coordinators.length })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /play-status — get playback state across all zones (from in-memory cache)
router.get('/play-status', (_req: Request, res: Response) => {
  const zones = sonosManager.getZones()
  let totalSpeakers = 0
  let playingCount = 0
  for (const zone of zones) {
    const memberCount = zone.members.length
    totalSpeakers += memberCount
    if (zone.coordinator.state.playbackState === 'PLAYING') {
      playingCount += memberCount
    }
  }
  res.json({
    anyPlaying: playingCount > 0,
    allPlaying: totalSpeakers > 0 && playingCount === totalSpeakers,
    playingCount,
    totalSpeakers,
  })
})

// GET /mute-status — get mute state across all zones
router.get('/mute-status', (_req: Request, res: Response) => {
  const zones = sonosManager.getZones()
  let totalSpeakers = 0
  let mutedCount = 0
  for (const zone of zones) {
    const memberCount = zone.members.length
    totalSpeakers += memberCount
    if (zone.coordinator.state.mute) {
      mutedCount += memberCount
    }
  }
  res.json({
    allMuted: totalSpeakers > 0 && mutedCount === totalSpeakers,
    mutedCount,
    totalSpeakers,
  })
})

// GET /speakers/:room/linked-devices — get device links for a speaker room
router.get('/speakers/:room/linked-devices', (req: Request, res: Response) => {
  try {
    const rawRoom = req.params.room
    const roomName = Array.isArray(rawRoom) ? rawRoom[0] : rawRoom
    const links = getAll<{
      id: number
      source_type: string
      source_id: string
      target_type: string
      target_id: string
      link_type: string
      created_at: string
    }>(
      `SELECT * FROM device_links
       WHERE (source_type = 'sonos' AND source_id = ?)
          OR (target_type = 'sonos' AND target_id = ?)
       ORDER BY created_at DESC`,
      [roomName, roomName],
    )
    res.json(links.map(l => ({
      id: l.id,
      sourceType: l.source_type,
      sourceId: l.source_id,
      targetType: l.target_type,
      targetId: l.target_id,
      linkType: l.link_type,
    })))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /group/:speaker/join/:target — add speaker to target's group
router.post('/group/:speaker/join/:target', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const target = Array.isArray(req.params.target) ? req.params.target[0] : req.params.target
    await sonosClient.joinGroup(speaker, target)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, target, action: 'join' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /group/:speaker/leave — remove speaker from its current group
router.post('/group/:speaker/leave', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    await sonosClient.leaveGroup(speaker)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, action: 'leave' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /health — check if Sonos API is reachable
router.get('/health', async (_req: Request, res: Response) => {
  const available = await sonosClient.isAvailable()
  res.json({ available })
})

// POST /test-spotify-playback/:speaker — diagnostic route (dev only)
// Tests whether a Spotify URI plays correctly through node-sonos-http-api's native spotify action.
// Accepts: { uri: string } — a Spotify URI (spotify:track:..., spotify:playlist:..., spotify:album:...)
// Returns: { played, playbackState, currentTrack, error? }
if (process.env.NODE_ENV !== 'production') {
  router.post('/test-spotify-playback/:speaker', async (req: Request, res: Response) => {
    try {
      const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
      const { uri } = req.body as { uri?: unknown }
      if (typeof uri !== 'string' || !uri.startsWith('spotify:')) {
        res.status(400).json({ error: 'uri must be a Spotify URI (spotify:track:..., spotify:playlist:..., etc.)' })
        return
      }
      const result = await sonosClient.testSpotifyPlayback(speaker, uri)
      res.json(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.status(502).json({ error: msg })
    }
  })
}

// POST /play-spotify/:speaker — play a Spotify URI through Sonos
// Accepts: { uri: string, action?: 'now' | 'queue' | 'next' }
// Uses node-sonos-http-api's native spotify action for correct URI translation.
router.post('/play-spotify/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { uri, action } = req.body as { uri?: unknown; action?: unknown }
    if (typeof uri !== 'string' || !uri.startsWith('spotify:')) {
      res.status(400).json({ error: 'uri must be a Spotify URI (spotify:track:..., spotify:playlist:..., etc.)' })
      return
    }
    const safeAction = action === 'queue' || action === 'next' ? action : 'now'
    await sonosClient.playSpotifyUri(speaker, uri, safeAction)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, uri, action: safeAction })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

export default router
