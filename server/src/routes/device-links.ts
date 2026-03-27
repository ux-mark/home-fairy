import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { getAll, getOne, run } from '../db/index.js'
import { kasaClient } from '../lib/kasa-client.js'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const router = Router()

interface DeviceLinkRow {
  id: number
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  link_type: string
  created_at: string
}

interface KasaDeviceRow {
  id: string
  label: string
  has_emeter: number
  is_online: number
}

interface CurrentStateRow {
  value: string
}

/**
 * Fetch enriched Kasa energy data for a linked device.
 * Returns nulls gracefully if the Kasa sidecar is down.
 */
async function getKasaEnrichedData(
  kasaId: string,
  kasaLabel: string,
  isOnline: boolean,
  hasEmeter: boolean,
): Promise<{
  label: string
  isOnline: boolean
  power: number | null
  todayWh: number | null
  todayCost: number | null
  monthWh: number | null
  monthlyCost: number | null
  currencySymbol: string
}> {
  // Read energy rate from preferences
  const rateRow = getOne<CurrentStateRow>("SELECT value FROM current_state WHERE key = 'pref_energy_rate'")
  const energyRate = rateRow ? parseFloat(rateRow.value) : 0
  const currRow = getOne<CurrentStateRow>("SELECT value FROM current_state WHERE key = 'pref_currency_symbol'")
  const currencySymbol = currRow?.value || '$'

  if (!isOnline || !hasEmeter) {
    return {
      label: kasaLabel,
      isOnline,
      power: null,
      todayWh: null,
      todayCost: null,
      monthWh: null,
      monthlyCost: null,
      currencySymbol,
    }
  }

  let power: number | null = null
  let todayWh: number | null = null
  let monthWh: number | null = null

  try {
    const emeter = await kasaClient.getEmeter(kasaId)
    power = typeof emeter.power === 'number' ? emeter.power : null
    // emeter.today is in Wh when present from sidecar
    if (typeof emeter.today === 'number') {
      todayWh = emeter.today
    }
  } catch {
    // Sidecar unavailable — return nulls for energy fields
  }

  try {
    const now = new Date()
    const monthly = await kasaClient.getMonthlyStats(kasaId)
    const currentMonthKey = now.getMonth() + 1
    const monthKwh = monthly.data[currentMonthKey]
    if (typeof monthKwh === 'number') {
      monthWh = monthKwh * 1000
    }
  } catch {
    // Sidecar unavailable
  }

  // If todayWh not from emeter, try daily stats
  if (todayWh === null) {
    try {
      const now = new Date()
      const daily = await kasaClient.getDailyStats(kasaId)
      const todayKey = now.getDate()
      const todayKwh = daily.data[todayKey]
      if (typeof todayKwh === 'number') {
        todayWh = todayKwh * 1000
      }
    } catch {
      // Sidecar unavailable
    }
  }

  const todayCost = todayWh !== null && energyRate > 0
    ? parseFloat(((todayWh / 1000) * energyRate).toFixed(4))
    : null

  const monthlyCost = monthWh !== null && energyRate > 0
    ? parseFloat(((monthWh / 1000) * energyRate).toFixed(4))
    : null

  return {
    label: kasaLabel,
    isOnline,
    power,
    todayWh,
    todayCost,
    monthWh,
    monthlyCost,
    currencySymbol,
  }
}

/**
 * Enrich a link row with live target device data.
 */
async function enrichLink(link: DeviceLinkRow) {
  if (link.target_type !== 'kasa') {
    return {
      id: link.id,
      sourceType: link.source_type,
      sourceId: link.source_id,
      targetType: link.target_type,
      targetId: link.target_id,
      linkType: link.link_type,
    }
  }

  const kasaRow = getOne<KasaDeviceRow>(
    'SELECT id, label, has_emeter, is_online FROM kasa_devices WHERE id = ?',
    [link.target_id],
  )

  if (!kasaRow) {
    return {
      id: link.id,
      sourceType: link.source_type,
      sourceId: link.source_id,
      targetType: link.target_type,
      targetId: link.target_id,
      linkType: link.link_type,
      target: null,
    }
  }

  const enriched = await getKasaEnrichedData(
    kasaRow.id,
    kasaRow.label,
    kasaRow.is_online === 1,
    kasaRow.has_emeter === 1,
  )

  return {
    id: link.id,
    sourceType: link.source_type,
    sourceId: link.source_id,
    targetType: link.target_type,
    targetId: link.target_id,
    linkType: link.link_type,
    target: enriched,
  }
}

// GET /device-links — list all links (no enrichment, fast)
router.get('/', (_req: Request, res: Response) => {
  try {
    const links = getAll<DeviceLinkRow>('SELECT * FROM device_links ORDER BY created_at DESC')
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

// GET /device-links/:sourceType/:sourceId
// Returns links where this device is EITHER source or target, enriched with live data
router.get('/:sourceType/:sourceId', async (req: Request, res: Response) => {
  try {
    const { sourceType, sourceId } = req.params
    const links = getAll<DeviceLinkRow>(
      `SELECT * FROM device_links
       WHERE (source_type = ? AND source_id = ?)
          OR (target_type = ? AND target_id = ?)
       ORDER BY created_at DESC`,
      [sourceType, sourceId, sourceType, sourceId],
    )

    const enriched = await Promise.all(links.map(enrichLink))
    res.json(enriched)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// POST /device-links — create a link
const createLinkSchema = z.object({
  source_type: z.enum(['sonos', 'kasa', 'lifx', 'hub']),
  source_id: z.string().min(1),
  target_type: z.enum(['kasa', 'sonos', 'lifx', 'hub']),
  target_id: z.string().min(1),
  link_type: z.enum(['power']).optional().default('power'),
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createLinkSchema.parse(req.body)

    // Validate source device exists
    if (data.source_type === 'sonos') {
      const speaker = getOne<{ id: number }>(
        'SELECT id FROM sonos_speakers WHERE room_name = ?',
        [data.source_id],
      )
      if (!speaker) {
        res.status(404).json({ error: `Sonos speaker not found for room "${data.source_id}"` })
        return
      }
    }

    // Validate target device exists
    if (data.target_type === 'kasa') {
      const kasa = getOne<{ id: string }>(
        'SELECT id FROM kasa_devices WHERE id = ?',
        [data.target_id],
      )
      if (!kasa) {
        res.status(404).json({ error: `Kasa device not found with id "${data.target_id}"` })
        return
      }
    }

    let lastInsertRowid: number
    try {
      const result = run(
        `INSERT INTO device_links (source_type, source_id, target_type, target_id, link_type)
         VALUES (?, ?, ?, ?, ?)`,
        [data.source_type, data.source_id, data.target_type, data.target_id, data.link_type],
      )
      lastInsertRowid = result.lastInsertRowid as number
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE constraint failed')) {
        res.status(409).json({ error: 'A link between these devices already exists' })
        return
      }
      throw err
    }

    const link = getOne<DeviceLinkRow>(
      'SELECT * FROM device_links WHERE id = ?',
      [lastInsertRowid],
    )

    if (!link) {
      res.status(500).json({ error: 'Failed to retrieve created link' })
      return
    }

    const enriched = await enrichLink(link)
    res.status(201).json(enriched)
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// DELETE /device-links/:id — delete a link
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid link ID' })
      return
    }
    const result = run('DELETE FROM device_links WHERE id = ?', [id])
    if (result.changes === 0) {
      res.status(404).json({ error: 'Link not found' })
      return
    }
    res.json({ deleted: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

export default router
