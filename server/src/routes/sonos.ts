import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run } from '../db/index.js'
import { sonosClient } from '../lib/sonos-client.js'
import { sonosManager } from '../lib/sonos-manager.js'
import { emit } from '../lib/socket.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

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
    res.status(502).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /state/:speaker — get playback state for a speaker
router.get('/state/:speaker', async (req: Request, res: Response) => {
  try {
    const speaker = Array.isArray(req.params.speaker) ? req.params.speaker[0] : req.params.speaker
    const state = await sonosClient.getState(speaker)
    res.json(state)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(502).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
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
    res.status(502).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
})

// GET /services — list music services the user has in their favourites
router.get('/services', async (_req: Request, res: Response) => {
  try {
    const services = await sonosClient.getUserServices()
    res.json(services)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(502).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
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
})

router.post('/auto-play', (req: Request, res: Response) => {
  try {
    const data = autoPlaySchema.parse(req.body)
    const result = run(
      `INSERT INTO sonos_auto_play (room_name, mode_name, favourite_name, trigger_type, trigger_value, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.room_name ?? null,
        data.mode_name,
        data.favourite_name,
        data.trigger_type,
        data.trigger_value ?? null,
        data.enabled ? 1 : 0,
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
    res.status(502).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
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
    res.status(502).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
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
    res.status(502).json({ error: IS_PRODUCTION ? 'Sonos API unavailable' : msg })
  }
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

// GET /health — check if Sonos API is reachable
router.get('/health', async (_req: Request, res: Response) => {
  const available = await sonosClient.isAvailable()
  res.json({ available })
})

export default router
