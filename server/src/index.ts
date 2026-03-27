import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDb, run, getOne, db } from './db/index.js'
import lifxRoutes from './routes/lifx.js'
import roomsRoutes from './routes/rooms.js'
import scenesRoutes from './routes/scenes.js'
import lightsRoutes from './routes/lights.js'
import systemRoutes from './routes/system.js'
import hubitatRoutes from './routes/hubitat.js'
import motionRoutes from './routes/motion.js'
import dashboardRoutes from './routes/dashboard.js'
import kasaRoutes from './routes/kasa.js'
import sonosRoutes from './routes/sonos.js'
import deviceLinksRoutes from './routes/device-links.js'
import { motionHandler } from './lib/motion-handler.js'
import { sunModeScheduler } from './lib/sun-mode-scheduler.js'
import { timeTriggerScheduler } from './lib/time-trigger-scheduler.js'
import { timerManager } from './lib/timer-manager.js'
import { activateScene } from './lib/scene-executor.js'
import { weatherIndicator } from './lib/weather-indicator.js'
import { startHistoryCollector, stopHistoryCollector } from './lib/history-collector.js'
import { notificationService } from './lib/notification-service.js'
import { startKasaPoller, stopKasaPoller } from './lib/kasa-poller.js'
import { sonosManager } from './lib/sonos-manager.js'
import { setSocketServer } from './lib/socket.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.PORT) || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:8000'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

// Simple rate limiter for webhook endpoint
const webhookHits = new Map<string, number[]>()
const WEBHOOK_RATE_LIMIT = 120 // max requests per minute
const WEBHOOK_RATE_WINDOW = 60_000 // 1 minute window

function isWebhookRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = webhookHits.get(ip) ?? []
  const recent = hits.filter(t => now - t < WEBHOOK_RATE_WINDOW)
  recent.push(now)
  webhookHits.set(ip, recent)
  return recent.length > WEBHOOK_RATE_LIMIT
}

// Validate required environment variables
const REQUIRED_ENV = ['LIFX_TOKEN', 'HUBITAT_TOKEN', 'HUB_BASE_URL', 'LATITUDE', 'LONGITUDE', 'OPENWEATHER_API'] as const
const missing = REQUIRED_ENV.filter(key => !process.env[key])
if (missing.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`)
  console.error('[startup] See .env.example for all required variables')
  process.exit(1)
}

// Initialize database
initDb()

const app = express()

app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '100kb' }))

const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: { origin: CORS_ORIGIN },
})
setSocketServer(io)

// Mount API routes
app.use('/api/lifx', lifxRoutes)
app.use('/api/rooms', roomsRoutes)
app.use('/api/scenes', scenesRoutes)
app.use('/api/lights', lightsRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/hubitat', hubitatRoutes)
app.use('/api/motion', motionRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/kasa', kasaRoutes)
app.use('/api/sonos', sonosRoutes)
app.use('/api/device-links', deviceLinksRoutes)

// Hubitat webhook handler
app.post('/hubitat', async (req, res) => {
  // Validate webhook secret
  const HUBITAT_WEBHOOK_SECRET = process.env.HUBITAT_WEBHOOK_SECRET
  if (HUBITAT_WEBHOOK_SECRET) {
    const token = (req.headers['x-hubitat-token'] as string) || (req.query.token as string)
    if (token !== HUBITAT_WEBHOOK_SECRET) {
      res.status(401).json({ error: 'Invalid webhook token' })
      return
    }
  }

  const clientIp = req.ip || 'unknown'
  if (isWebhookRateLimited(clientIp)) {
    res.status(429).json({ error: 'Rate limit exceeded' })
    return
  }

  try {
    const raw = req.body
    // Hubitat sends { content: { name, value, displayName, unit, descriptionText } }
    const event = raw.content ?? raw
    if (process.env.DEBUG) console.log('Hubitat event:', JSON.stringify(event))

    const displayName: string = event.displayName ?? event.displayname ?? 'unknown'
    const deviceId: string | null = event.deviceId != null ? String(event.deviceId) : null
    const eventName: string = event.name ?? ''
    const eventValue: string = String(event.value ?? '')

    // Skip events for devices that have been migrated to Kasa direct control
    const kasaMigrated = getOne<{ id: string }>(
      'SELECT id FROM kasa_devices WHERE label = ?',
      [displayName],
    )
    if (kasaMigrated) {
      res.json({ success: true, skipped: true, reason: 'device managed by Kasa sidecar' })
      return
    }

    // Sync device_rooms.device_label if Hubitat device name has changed
    if (deviceId) {
      const deviceRoom = getOne<{ device_label: string }>(
        'SELECT device_label FROM device_rooms WHERE device_id = ?',
        [deviceId],
      )
      if (deviceRoom && deviceRoom.device_label !== displayName) {
        run(
          'UPDATE device_rooms SET device_label = ? WHERE device_id = ?',
          [displayName, deviceId],
        )
        console.log(`[hubitat] Synced device_rooms label: "${deviceRoom.device_label}" → "${displayName}" (device ${deviceId})`)
      }
    }

    // Log the event
    run(
      'INSERT INTO logs (message, debug, category) VALUES (?, ?, ?)',
      [`Hubitat: ${displayName} ${eventName} = ${eventValue}`, JSON.stringify(event), 'hubitat'],
    )

    // Use device ID for hub_devices lookups when available (more robust than label which can change)
    const hubWhereClause = deviceId ? 'id = ?' : 'label = ?'
    const hubWhereParam = deviceId ?? displayName

    // Route events to appropriate handlers
    switch (eventName) {
      case 'motion':
        await motionHandler.handleMotionEvent(
          deviceId,
          displayName,
          eventValue as 'active' | 'inactive',
        )
        break

      case 'temperature':
        // Update temperature in hub_devices attributes (source of truth)
        run(
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.temperature', ?), updated_at = datetime('now') WHERE ${hubWhereClause}`,
          [Number(eventValue), hubWhereParam],
        )
        break

      case 'illuminance':
      case 'lux':
        // Update illuminance in hub_devices attributes (source of truth)
        run(
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.illuminance', ?), updated_at = datetime('now') WHERE ${hubWhereClause}`,
          [Number(eventValue), hubWhereParam],
        )
        break

      case 'battery': {
        // Update battery level in hub_devices attributes
        run(
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.battery', ?), updated_at = datetime('now') WHERE ${hubWhereClause}`,
          [eventValue, hubWhereParam],
        )
        const batteryLevel = Number(eventValue)
        if (batteryLevel < 5) {
          console.error(`Critical battery: ${displayName} at ${batteryLevel}%`)
          run(
            'INSERT INTO logs (message, category) VALUES (?, ?)',
            [`Critical battery: ${displayName} at ${batteryLevel}%`, 'battery'],
          )
          notificationService.create({
            severity: 'critical',
            category: 'battery',
            title: `${displayName} battery critical`,
            message: `${displayName} at ${batteryLevel}% — replace soon`,
            sourceType: 'sensor',
            sourceId: String(displayName),
            sourceLabel: displayName,
            dedupKey: `battery_critical:${displayName}`,
          })
        } else if (batteryLevel < 15) {
          console.warn(`Low battery: ${displayName} at ${batteryLevel}%`)
          run(
            'INSERT INTO logs (message, category) VALUES (?, ?)',
            [`Low battery: ${displayName} at ${batteryLevel}%`, 'battery'],
          )
          notificationService.create({
            severity: 'warning',
            category: 'battery',
            title: `${displayName} battery low`,
            message: `${displayName} at ${batteryLevel}%`,
            sourceType: 'sensor',
            sourceId: String(displayName),
            sourceLabel: displayName,
            dedupKey: `battery_low:${displayName}`,
          })
        }
        break
      }

      case 'power': {
        // Smart plug real-time power draw (watts)
        run(
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.power', ?), updated_at = datetime('now') WHERE ${hubWhereClause}`,
          [Number(eventValue), hubWhereParam],
        )
        run(
          'INSERT INTO device_history (source, source_id, value) VALUES (?, ?, ?)',
          ['power', displayName, Number(eventValue)],
        )
        break
      }

      case 'energy': {
        // Smart plug cumulative energy usage (kWh)
        run(
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.energy', ?), updated_at = datetime('now') WHERE ${hubWhereClause}`,
          [Number(eventValue), hubWhereParam],
        )
        run(
          'INSERT INTO device_history (source, source_id, value) VALUES (?, ?, ?)',
          ['energy', displayName, Number(eventValue)],
        )
        break
      }

      case 'switch': {
        // Track on/off state changes in attributes
        run(
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.switch', ?), updated_at = datetime('now') WHERE ${hubWhereClause}`,
          [eventValue, hubWhereParam],
        )
        break
      }
    }

    // Emit to connected clients for real-time UI updates
    io.emit('hubitat:event', event)

    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Hubitat webhook error:', msg)
    res.status(500).json({ error: IS_PRODUCTION ? 'Internal server error' : msg })
  }
})

// Serve static files in production
const clientDist = path.join(__dirname, '../../client/dist')
app.use(express.static(clientDist))

// SPA fallback — serve index.html for any non-API route so client-side routing works
// Express 5 requires named wildcard parameter syntax
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'))
})

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

// Wire notification service to Socket.io for real-time client push
notificationService.setEmitter((event, data) => io.emit(event, data))

// Wire up scene timer expiry — activate the target scene when the timer fires
timerManager.setOnExpire(async (targetScene, sceneName) => {
  try {
    console.log(`Scene timer expired: ${sceneName} -> activating ${targetScene}`)
    run(
      'INSERT INTO logs (message, category) VALUES (?, ?)',
      [`Scene timer expired (${sceneName}): activating "${targetScene}"`, 'timer'],
    )
    await activateScene(targetScene)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Failed to activate scene from timer: ${msg}`)
  }
})

httpServer.listen(PORT, () => {
  console.log(`Home Fairy server running on port ${PORT}`)
  console.log(`CORS origin: ${CORS_ORIGIN}`)
  sunModeScheduler.init(io)
  timeTriggerScheduler.init(io)
  weatherIndicator.start()
  startHistoryCollector()
  startKasaPoller(io)
  sonosManager.setIsRoomLocked((room) => motionHandler.isRoomLocked(room))
  sonosManager.init()
})

// Graceful shutdown
function shutdown(signal: string): void {
  console.log(`[shutdown] Received ${signal}. Shutting down gracefully...`)

  // Safety timeout: force exit if shutdown takes too long
  const forceExit = setTimeout(() => {
    console.error('[shutdown] Shutdown timed out after 5 seconds. Forcing exit.')
    process.exit(1)
  }, 5_000)
  forceExit.unref()

  stopHistoryCollector()
  stopKasaPoller()
  sonosManager.shutdown()
  weatherIndicator.stop()
  sunModeScheduler.clearTimers()
  timeTriggerScheduler.clearTimers()

  io.close(() => {
    httpServer.close(() => {
      try {
        db.close()
      } catch {
        // ignore close errors
      }
      console.log('[shutdown] Shutdown complete.')
      process.exit(0)
    })
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export { io }
