import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import axios from 'axios'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { db, getAll, getOne, run } from '../db/index.js'
import { sonosClient } from '../lib/sonos-client.js'
import { musicBrainzClient, type ArtistCountryRow } from '../lib/musicbrainz-client.js'
import { spotifyClient } from '../lib/spotify-client.js'
import { sonosManager } from '../lib/sonos-manager.js'
import { emit } from '../lib/socket.js'
import { findPodcastFeedUrl, getLatestEpisodeUrl } from '../lib/podcast-resolver.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const SONOS_API_URL = process.env.SONOS_API_URL || 'http://localhost:3003'

const router = Router()

// ── Album art disk cache ──────────────────────────────────────────────────────

const ART_CACHE_DIR = join(process.cwd(), 'data', 'art-cache')
// Create cache directory on module load — recursive so it works even if data/ doesn't exist yet
mkdirSync(ART_CACHE_DIR, { recursive: true })

function artCachePath(url: string): { imgPath: string; metaPath: string } {
  const hash = createHash('sha256').update(url).digest('hex')
  return {
    imgPath: join(ART_CACHE_DIR, hash),
    metaPath: join(ART_CACHE_DIR, `${hash}.meta.json`),
  }
}

// ── Album art proxy helpers ───────────────────────────────────────────────────

const INTERNAL_IP_RE = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|localhost|127\.0\.0\.1)([\/:?]|$)/i

// Speaker IP cache for album art rewriting — populated from zones on first use
let cachedSpeakerIp: string | null = null

async function ensureSpeakerIp(): Promise<string | null> {
  if (cachedSpeakerIp) return cachedSpeakerIp
  try {
    const info = await sonosClient.getSpeakerInfoByName('')
    // getSpeakerInfoByName with empty name falls through to getSpeakerIp
  } catch { /* ignore */ }
  // Try via zones
  try {
    const zones = await sonosClient.getZones()
    for (const zone of zones) {
      const coord = zone.coordinator as Record<string, unknown> | undefined
      const state = coord?.state as Record<string, unknown> | undefined
      const ct = state?.currentTrack as Record<string, unknown> | undefined
      const absUri = ct?.absoluteAlbumArtUri
      if (typeof absUri === 'string') {
        const match = absUri.match(/https?:\/\/([\d.]+)/)
        if (match) { cachedSpeakerIp = match[1]; return match[1] }
      }
    }
  } catch { /* ignore */ }
  return null
}

// Warm the cache on startup (non-blocking)
setTimeout(() => ensureSpeakerIp(), 5_000)

/**
 * Rewrite a Sonos albumArtUri so it can be fetched by the browser.
 * - Relative /getaa paths are routed to the Sonos speaker IP directly (not via node-sonos-http-api)
 * - Other relative paths are made absolute using the Sonos HTTP API base URL
 * - Internal/private IP addresses are proxied through /api/sonos/art-proxy
 * - External HTTP URLs are also proxied to avoid mixed-content browser blocks
 * - External HTTPS URLs are returned unchanged
 */
// ── Auto-backfill: lazily fetch missing artist images in background ──────────

let nasImageBackfillRunning = false

function triggerNasAutoBackfill(): void {
  if (nasImageBackfillRunning) return
  if (!spotifyClient.isConnected()) return

  const missing = db.prepare(
    "SELECT COUNT(*) as cnt FROM artist_countries WHERE image_url IS NULL AND spotify_artist_id NOT LIKE 'nas:%'",
  ).get() as { cnt: number }
  const missingNas = db.prepare(
    "SELECT COUNT(*) as cnt FROM artist_countries WHERE image_url IS NULL AND spotify_artist_id LIKE 'nas:%'",
  ).get() as { cnt: number }
  if (missing.cnt === 0 && missingNas.cnt === 0) return

  nasImageBackfillRunning = true
  console.log(`[Backfill] Auto-fetching images for ${missing.cnt} Spotify + ${missingNas.cnt} NAS artists...`)

  musicBrainzClient.backfillImages(spotifyClient)
    .then(result => {
      if (result.updated > 0) console.log(`[Backfill] Spotify images: ${result.updated}/${result.total} updated`)
      return musicBrainzClient.backfillNasImages(spotifyClient)
    })
    .then(result => {
      if (result.updated > 0) console.log(`[Backfill] NAS images: ${result.updated}/${result.total} updated`)
    })
    .catch(err => {
      console.error('[Backfill] Auto-backfill failed:', err instanceof Error ? err.message : String(err))
    })
    .finally(() => {
      nasImageBackfillRunning = false
    })
}

function rewriteAlbumArtUri(uri: string | undefined): string | undefined {
  if (!uri) return undefined

  // Relative /getaa path — route directly to Sonos speaker IP (node-sonos-http-api's
  // /getaa proxy is unreliable). Falls back to node-sonos-http-api if speaker IP unknown.
  if (uri.startsWith('/')) {
    const base = cachedSpeakerIp ? `http://${cachedSpeakerIp}:1400` : SONOS_API_URL
    const absolute = `${base}${uri}`
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

  // External HTTPS — proxy for disk caching + PWA offline
  return `/api/sonos/art-proxy?url=${encodeURIComponent(uri)}`
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

  const { imgPath, metaPath } = artCachePath(url)

  // Serve from disk cache if both files exist
  if (existsSync(imgPath) && existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as { contentType?: string }
      res.set('Content-Type', meta.contentType || 'image/jpeg')
      res.set('Cache-Control', 'public, max-age=31536000, immutable')
      res.sendFile(imgPath)
      return
    } catch {
      // Corrupted cache entry — fall through to re-fetch
    }
  }

  // Fetch from upstream with a generous timeout for slow NAS devices
  try {
    const upstream = await axios.get<Buffer>(url, {
      responseType: 'arraybuffer',
      timeout: 15_000,
      // Don't throw on non-2xx so we can surface a clean error
      validateStatus: status => status < 500,
    })

    if (upstream.status >= 400) {
      res.status(502).json({ error: `Upstream returned ${upstream.status}` })
      return
    }

    const contentType = (upstream.headers['content-type'] as string | undefined) || 'image/jpeg'

    // Write to disk cache (don't block response on failure)
    try {
      writeFileSync(imgPath, upstream.data)
      writeFileSync(metaPath, JSON.stringify({ contentType, url, cachedAt: new Date().toISOString() }))
    } catch {
      // Cache write failed — not critical, serve the image anyway
    }

    res.set('Content-Type', contentType)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
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

// GET /speakers-with-rooms — speaker mappings joined with room icons
router.get('/speakers-with-rooms', (_req: Request, res: Response) => {
  const speakers = getAll<{
    id: number
    room_name: string
    speaker_name: string
    favourite: string | null
    default_volume: number
    created_at: string
    room_icon: string | null
  }>(
    `SELECT ss.*, r.icon AS room_icon
     FROM sonos_speakers ss
     LEFT JOIN rooms r ON r.name = ss.room_name
     ORDER BY ss.room_name`,
  )
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
    const speakerInfo = await sonosClient.getSpeakerInfoByName(speaker)
    if (!speakerInfo) {
      res.status(404).json({ error: `Speaker not found: ${speaker}` })
      return
    }
    await sonosClient.addToQueueSOAP(speakerInfo.ip, parsed.data.uri)
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
    const speakerInfo = await sonosClient.getSpeakerInfoByName(speaker)
    if (!speakerInfo) {
      res.status(404).json({ error: `Speaker not found: ${speaker}` })
      return
    }
    await sonosClient.playNextSOAP(speakerInfo.ip, parsed.data.uri)
    emit('sonos:playback-update', { speaker })
    const queue = await sonosClient.getQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'playnext', queue })
    res.json({ speaker, action: 'play-next' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /queue/:speaker/add-album — add all tracks of an album/playlist to queue
const addAlbumSchema = z.object({
  uri: z.string().min(1),
  source: z.enum(['spotify', 'nas']),
})

router.post('/queue/:speaker/add-album', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const parsed = addAlbumSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' })
      return
    }
    const { uri, source } = parsed.data

    if (source === 'spotify') {
      await sonosClient.playSpotifyUri(speaker, uri, 'queue')
      emit('sonos:playback-update', { speaker })
      res.json({ speaker, action: 'add-album-to-queue' })
      return
    }

    // NAS: fetch all tracks and add to queue via SOAP
    const speakerInfo = await sonosClient.getSpeakerInfoByName(speaker)
    if (!speakerInfo) {
      res.status(404).json({ error: `Speaker not found: ${speaker}` })
      return
    }

    const tracks = await sonosClient.getGenreAlbumTracks(uri)
    if (tracks.length === 0) {
      res.status(404).json({ error: 'No tracks found for this album' })
      return
    }

    let queued = 0
    for (const track of tracks) {
      try {
        await sonosClient.addToQueueSOAP(speakerInfo.ip, track.uri)
        queued++
      } catch (err) {
        console.error(`[sonos] add-album: failed to add "${track.title}": ${err instanceof Error ? err.message : err}`)
      }
    }

    emit('sonos:playback-update', { speaker })
    const queue = await sonosClient.getQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'add', queue })
    res.json({ speaker, action: 'add-album-to-queue', tracksQueued: queued })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /queue/:speaker/playnext-album — insert album tracks after current track
router.post('/queue/:speaker/playnext-album', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const parsed = addAlbumSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' })
      return
    }
    const { uri, source } = parsed.data

    if (source === 'spotify') {
      await sonosClient.playSpotifyUri(speaker, uri, 'next')
      emit('sonos:playback-update', { speaker })
      res.json({ speaker, action: 'playnext-album' })
      return
    }

    // NAS: fetch tracks and add in reverse order so track 1 lands right after current
    const speakerInfo = await sonosClient.getSpeakerInfoByName(speaker)
    if (!speakerInfo) {
      res.status(404).json({ error: `Speaker not found: ${speaker}` })
      return
    }

    const tracks = await sonosClient.getGenreAlbumTracks(uri)
    if (tracks.length === 0) {
      res.status(404).json({ error: 'No tracks found for this album' })
      return
    }

    for (const track of [...tracks].reverse()) {
      try {
        await sonosClient.playNextSOAP(speakerInfo.ip, track.uri)
      } catch (err) {
        console.error(`[sonos] playnext-album: failed for "${track.title}": ${err instanceof Error ? err.message : err}`)
      }
    }

    emit('sonos:playback-update', { speaker })
    const queue = await sonosClient.getQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'playnext', queue })
    res.json({ speaker, action: 'playnext-album' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// DELETE /queue/:speaker/remove/:index — remove item from queue by index (0-based)
router.delete('/queue/:speaker/remove/:index', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const rawIndex = Array.isArray(req.params.index) ? req.params.index[0] : req.params.index
    const index = parseInt(rawIndex, 10)
    if (isNaN(index) || index < 0) {
      res.status(400).json({ error: 'index must be a non-negative integer' })
      return
    }
    const speakerInfo = await sonosClient.getSpeakerInfoByName(speaker)
    if (!speakerInfo) {
      res.status(404).json({ error: `Speaker not found: ${speaker}` })
      return
    }
    // Convert 0-based frontend index to 1-based Sonos queue position
    await sonosClient.removeFromQueueSOAP(speakerInfo.ip, index + 1)
    const queue = await sonosClient.getQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'remove', queue })
    res.json({ speaker, action: 'remove-from-queue', index })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /queue/:speaker/reorder — move item in queue (from/to are 0-based)
router.post('/queue/:speaker/reorder', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const parsed = reorderQueueSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' })
      return
    }
    const { from, to } = parsed.data
    const speakerInfo = await sonosClient.getSpeakerInfoByName(speaker)
    if (!speakerInfo) {
      res.status(404).json({ error: `Speaker not found: ${speaker}` })
      return
    }
    // Convert 0-based frontend indices to 1-based Sonos positions.
    // ReorderTracksInQueue uses insertBefore semantics:
    //   moving forward (from < to): insertBefore = to + 2 (accounts for index shift after removal)
    //   moving backward (from > to): insertBefore = to + 1
    const startIndex = from + 1
    const insertBefore = from < to ? to + 2 : to + 1
    await sonosClient.reorderQueueSOAP(speakerInfo.ip, startIndex, insertBefore)
    const queue = await sonosClient.getQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'reorder', queue })
    res.json({ speaker, action: 'reorder-queue', from, to })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// POST /queue/:speaker/seek/:trackNumber — seek to a track in the queue (1-based)
router.post('/queue/:speaker/seek/:trackNumber', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const rawTrackNumber = Array.isArray(req.params.trackNumber) ? req.params.trackNumber[0] : req.params.trackNumber
    const trackNumber = parseInt(rawTrackNumber, 10)
    if (isNaN(trackNumber) || trackNumber < 1) {
      res.status(400).json({ error: 'trackNumber must be a positive integer' })
      return
    }
    const speakerInfo = await sonosClient.getSpeakerInfoByName(speaker)
    if (!speakerInfo) {
      res.status(404).json({ error: `Speaker not found: ${speaker}` })
      return
    }
    await sonosClient.seekToTrackSOAP(speakerInfo.ip, trackNumber)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, action: 'seek-to-track', trackNumber })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// DELETE /queue/:speaker/clear — clear the entire queue
router.delete('/queue/:speaker/clear', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    await sonosClient.clearQueue(speaker)
    emit('sonos:queue-update', { speaker, action: 'clear', queue: [] })
    res.json({ speaker, action: 'clear-queue' })
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
router.get('/library/artist/:name', async (req: Request, res: Response) => {
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name
  const tracks = await sonosClient.getArtistTracks(name)
  res.json(tracks.map(t => ({ ...t, albumArtUri: rewriteAlbumArtUri(t.albumArtUri) ?? '' })))
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
router.get('/library/search', async (req: Request, res: Response) => {
  const rawQ = req.query.q
  const q = typeof rawQ === 'string' ? rawQ.trim() : ''
  if (!q) {
    res.status(400).json({ error: 'Missing required query parameter: q' })
    return
  }
  const result = await sonosClient.searchLibrary(q)
  res.json({
    ...result,
    tracks: result.tracks.map(t => ({ ...t, albumArtUri: rewriteAlbumArtUri(t.albumArtUri) ?? '' })),
  })
})

// GET /library/songs — list all NAS library tracks sorted alphabetically
router.get('/library/songs', async (_req: Request, res: Response) => {
  const tracks = await sonosClient.getAllLibraryTracks()
  res.json(tracks.map(t => ({ ...t, albumArtUri: rewriteAlbumArtUri(t.albumArtUri) ?? '' })))
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

// POST /repeat/:speaker — enable or disable repeat (optionally with mode: 'off' | 'all' | 'one')
const repeatSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['off', 'all', 'one']).optional(),
})

router.post('/repeat/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { enabled, mode } = repeatSchema.parse(req.body)
    let resolvedMode: 'off' | 'all' | 'one'
    if (mode === 'one') {
      await sonosClient.repeatOne(speaker)
      resolvedMode = 'one'
    } else if (mode === 'all' || (!mode && enabled)) {
      await sonosClient.repeat(speaker, true)
      resolvedMode = 'all'
    } else {
      await sonosClient.repeat(speaker, false)
      resolvedMode = 'off'
    }
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, repeat: enabled, mode: resolvedMode })
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

// PUT /group-volume/:speaker — set group volume (adjusts all members proportionally)
router.put('/group-volume/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { level } = volumeSchema.parse(req.body)
    await sonosClient.setGroupVolume(speaker, level)
    emit('sonos:playback-update', { speaker })
    res.json({ speaker, groupVolume: level })
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

// PUT /sonos/play-uri/:speaker — play a URI or content directory container
// Accepts: { uri: string }
// For direct track URIs (x-file-cifs://...): uses setAVTransportURI + play
// For content directory IDs (A:ALBUM:..., A:ALBUMARTIST/...): fetches tracks,
// clears queue, adds all tracks in order, then plays from the start
router.put('/play-uri/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const { uri } = req.body as { uri?: unknown }
    if (typeof uri !== 'string' || !uri) {
      res.status(400).json({ error: 'uri is required and must be a non-empty string' })
      return
    }

    const isContainer = uri.startsWith('A:') || uri.startsWith('S:') || uri.startsWith('SQ:')
    console.log(`[sonos] play-uri: speaker=${speaker}, uri=${uri}, isContainer=${isContainer}`)

    // Content directory container (album/playlist) — queue all tracks then play
    if (isContainer) {
      const tracks = await sonosClient.getGenreAlbumTracks(uri)
      console.log(`[sonos] play-uri: fetched ${tracks.length} tracks for container`)
      if (tracks.length === 0) {
        res.status(404).json({ error: 'No tracks found in this container' })
        return
      }
      // Get speaker IP + UUID for direct UPnP SOAP calls (bypasses node-sonos-http-api
      // which mangles URIs with special characters like accents and spaces)
      const speakerInfo = await sonosClient.getSpeakerInfoByName(speaker)
      if (!speakerInfo) {
        res.status(424).json({ error: 'Could not resolve speaker IP address' })
        return
      }
      await sonosClient.clearQueue(speaker)
      // Add tracks sequentially via UPnP SOAP — preserves album order exactly
      let queued = 0
      for (const track of tracks) {
        try {
          await sonosClient.addToQueueSOAP(speakerInfo.ip, track.uri)
          queued++
        } catch (err) {
          console.error(`[sonos] play-uri: SOAP addToQueue failed for "${track.title}": ${err instanceof Error ? err.message : err}`)
        }
      }
      if (queued === 0) {
        res.status(424).json({ error: 'Could not add any tracks to queue' })
        return
      }
      // Switch transport to the queue and start from track 1
      await sonosClient.playQueueFromStart(speakerInfo.ip, speakerInfo.uuid)
      emit('sonos:playback-update', { speaker })
      const queue = await sonosClient.getQueue(speaker)
      emit('sonos:queue-update', { speaker, action: 'replace', queue })
      console.log(`[sonos] play-uri: queued ${queued}/${tracks.length} tracks, playing from track 1`)
      res.json({ speaker, uri, tracksQueued: queued })
    } else {
      // Direct track URI — set transport and play
      await sonosClient.setAVTransportURI(speaker, uri)
      await sonosClient.play(speaker)
      emit('sonos:playback-update', { speaker })
      res.json({ speaker, uri })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[sonos] play-uri failed: ${msg}`)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// ── NAS Artist Country Enrichment ────────────────────────────────────────────

// POST /library/enrich-artists — kick off background enrichment for NAS artists
router.post('/library/enrich-artists', async (_req: Request, res: Response) => {
  const progress = musicBrainzClient.getNasProgress()
  if (progress.status === 'running') {
    res.json({ ...progress, status: 'already_running' })
    return
  }

  try {
    const artists = sonosClient.getLibraryArtists()
    const names = artists.map(a => a.name).filter(n => n.length > 0)

    if (names.length === 0) {
      res.json({ status: 'no_artists', total: 0 })
      return
    }

    // Run enrichment in background
    musicBrainzClient.enrichNasArtists(names).catch(err => {
      console.error('[Enrichment] NAS enrichment error:', err instanceof Error ? err.message : String(err))
    })

    res.json({ status: 'started', total: names.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /library/enrichment-status — check NAS enrichment progress
router.get('/library/enrichment-status', (_req: Request, res: Response) => {
  res.json(musicBrainzClient.getNasProgress())
})

// POST /library/enrich-artists/cancel — cancel NAS enrichment
router.post('/library/enrich-artists/cancel', (_req: Request, res: Response) => {
  musicBrainzClient.cancel()
  res.json({ ok: true })
})

// GET /library/artist-countries — get country data for NAS artists (by name)
router.get('/library/artist-countries', (_req: Request, res: Response) => {
  try {
    // Return all entries: NAS-keyed (nas:) and Spotify-keyed (matching by name)
    const rows = db.prepare('SELECT * FROM artist_countries ORDER BY artist_name COLLATE NOCASE').all() as ArtistCountryRow[]
    res.json({ items: rows, total: rows.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// GET /library/albums/enriched — NAS albums with country data joined
router.get('/library/albums/enriched', async (_req: Request, res: Response) => {
  try {
    const albums = await sonosClient.browseAlbumsWithArt()

    // Build a name → country lookup from artist_countries table
    const allCountries = db.prepare('SELECT * FROM artist_countries').all() as ArtistCountryRow[]
    const countryByName = new Map<string, ArtistCountryRow>()
    for (const row of allCountries) {
      // Index by lowercased name for case-insensitive matching
      const key = row.artist_name.toLowerCase()
      if (!countryByName.has(key)) countryByName.set(key, row)
    }

    const enriched = albums.map(album => {
      const artistKey = album.artist.toLowerCase()
      const country = countryByName.get(artistKey)
      return {
        ...album,
        albumArtUri: rewriteAlbumArtUri(album.albumArtUri) ?? '',
        artist_country: country ? {
          country_code: country.country_code,
          country_name: country.country_name,
          sub_region: country.sub_region,
          confidence: country.confidence,
          image_url: country.image_url ?? null,
        } : null,
      }
    })

    const withCountry = enriched.filter(a => a.artist_country?.country_code)
    res.json({
      items: enriched,
      total: enriched.length,
      cached_artists: withCountry.length,
      uncached_artists: enriched.length - withCountry.length,
    })
    triggerNasAutoBackfill()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(424).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /library/artists/enriched — NAS artists with country data joined
router.get('/library/artists/enriched', (_req: Request, res: Response) => {
  try {
    const artists = sonosClient.getLibraryArtists()

    // Build name → country lookup
    const allCountries = db.prepare('SELECT * FROM artist_countries').all() as ArtistCountryRow[]
    const countryByName = new Map<string, ArtistCountryRow>()
    for (const row of allCountries) {
      const key = row.artist_name.toLowerCase()
      if (!countryByName.has(key)) countryByName.set(key, row)
    }

    const enriched = artists.map(artist => {
      const country = countryByName.get(artist.name.toLowerCase())
      return {
        ...artist,
        country_code: country?.country_code ?? null,
        country_name: country?.country_name ?? null,
        sub_region: country?.sub_region ?? null,
        confidence: country?.confidence ?? null,
        image_url: country?.image_url ?? null,
      }
    })

    res.json({ items: enriched, total: enriched.length })
    triggerNasAutoBackfill()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
