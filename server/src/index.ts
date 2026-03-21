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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = Number(process.env.PORT) || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'

// Initialize database
initDb()

const app = express()

app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json())

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

// Hubitat webhook handler
app.post('/hubitat', (req, res) => {
  try {
    const event = req.body
    console.log('Hubitat event:', JSON.stringify(event))

    // Log the event
    run(
      'INSERT INTO logs (message, debug, category) VALUES (?, ?, ?)',
      [`Hubitat: ${event.displayName ?? 'unknown'} ${event.name ?? ''} = ${event.value ?? ''}`, JSON.stringify(event), 'hubitat'],
    )

    // Emit to connected clients
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

httpServer.listen(PORT, () => {
  console.log(`The Fairies server running on port ${PORT}`)
  console.log(`CORS origin: ${CORS_ORIGIN}`)
})

export { io }
