import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import { initDb, run } from './db/index.js'
import lifxRoutes from './routes/lifx.js'
import roomsRoutes from './routes/rooms.js'
import scenesRoutes from './routes/scenes.js'
import lightsRoutes from './routes/lights.js'
import systemRoutes from './routes/system.js'
import hubitatRoutes from './routes/hubitat.js'
import motionRoutes from './routes/motion.js'
import dashboardRoutes from './routes/dashboard.js'
import { motionHandler } from './lib/motion-handler.js'
import { sunModeScheduler } from './lib/sun-mode-scheduler.js'
import { timeTriggerScheduler } from './lib/time-trigger-scheduler.js'
import { timerManager } from './lib/timer-manager.js'
import { activateScene } from './lib/scene-executor.js'
import { weatherIndicator } from './lib/weather-indicator.js'
import { startHistoryCollector } from './lib/history-collector.js'
import { notificationService } from './lib/notification-service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.PORT) || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:8000'

// Initialize database
initDb()

const app = express()

app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json({ limit: '10mb' }))

const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: { origin: CORS_ORIGIN },
})

// Mount API routes
app.use('/api/lifx', lifxRoutes)
app.use('/api/rooms', roomsRoutes)
app.use('/api/scenes', scenesRoutes)
app.use('/api/lights', lightsRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/hubitat', hubitatRoutes)
app.use('/api/motion', motionRoutes)
app.use('/api/dashboard', dashboardRoutes)

// Hubitat webhook handler
app.post('/hubitat', async (req, res) => {
  try {
    const raw = req.body
    // Hubitat sends { content: { name, value, displayName, unit, descriptionText } }
    const event = raw.content ?? raw
    console.log('Hubitat event:', JSON.stringify(event))

    const displayName: string = event.displayName ?? event.displayname ?? 'unknown'
    const eventName: string = event.name ?? ''
    const eventValue: string = String(event.value ?? '')

    // Log the event
    run(
      'INSERT INTO logs (message, debug, category) VALUES (?, ?, ?)',
      [`Hubitat: ${displayName} ${eventName} = ${eventValue}`, JSON.stringify(event), 'hubitat'],
    )

    // Route events to appropriate handlers
    switch (eventName) {
      case 'motion':
        await motionHandler.handleMotionEvent(
          displayName,
          eventValue as 'active' | 'inactive',
        )
        break

      case 'temperature':
        await motionHandler.handleTemperatureEvent(
          displayName,
          Number(eventValue),
        )
        break

      case 'illuminance':
      case 'lux':
        await motionHandler.handleLuxEvent(displayName, Number(eventValue))
        break

      case 'battery': {
        // Update battery level in hub_devices attributes
        run(
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.battery', ?), updated_at = datetime('now') WHERE label = ?`,
          [eventValue, displayName],
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
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.power', ?), updated_at = datetime('now') WHERE label = ?`,
          [Number(eventValue), displayName],
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
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.energy', ?), updated_at = datetime('now') WHERE label = ?`,
          [Number(eventValue), displayName],
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
          `UPDATE hub_devices SET attributes = json_set(COALESCE(attributes, '{}'), '$.switch', ?), updated_at = datetime('now') WHERE label = ?`,
          [eventValue, displayName],
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
    res.status(500).json({ error: msg })
  }
})

// Serve static files in production
const clientDist = path.join(__dirname, '../../client/dist')
app.use(express.static(clientDist))

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
})

export { io }
