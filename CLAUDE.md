# The Fairies v3 — Home Automation System

## Project Overview
A home automation control system with a React frontend and Express backend. Controls LIFX lights, Hubitat switches/sensors, Twinkly decorative lights, and fairy (ESP8266) devices. Includes MTA subway tracking, weather indicators, and motion-based scene automation.

## Architecture
```
thefairies-app/
├── client/          React + Vite + TypeScript + Tailwind CSS v4
│   ├── src/
│   │   ├── pages/          7 pages (Home, Rooms, RoomDetail, Scenes, SceneEditor, Devices, Settings, Watch, Logs)
│   │   ├── components/     Layout (AppLayout, WatchLayout) + UI components
│   │   ├── hooks/          useToast, useTheme
│   │   └── lib/            api.ts (API client + types), utils.ts
│   ├── e2e/                Playwright E2E tests
│   └── vite.config.ts      Vite config with PWA + proxy to :3001
├── server/          Express 5 + TypeScript + SQLite (better-sqlite3)
│   ├── src/
│   │   ├── routes/         lifx, rooms, scenes, lights, hubitat, motion, system
│   │   ├── lib/            lifx-client, hubitat-client, twinkly-client, fairy-device-client,
│   │   │                   scene-executor, motion-handler, timer-manager, sun-mode-scheduler,
│   │   │                   weather-client, weather-indicator, mta-client, mta-stops
│   │   ├── db/             SQLite setup + migrations
│   │   └── index.ts        Express server entry point
│   ├── scripts/            Migration and seed scripts
│   ├── data/               SQLite database (gitignored)
│   └── .env                Environment variables (gitignored)
└── deploy-to-pi.sh         Deployment script for Raspberry Pi
```

## Tech Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Radix UI, react-colorful (HSV picker), TanStack Query, Socket.io client, PWA
- **Backend**: Express 5, TypeScript, better-sqlite3, Socket.io, axios, Zod validation, SunCalc, gtfs-realtime-bindings
- **Database**: SQLite with WAL mode. Tables: rooms, scenes, light_rooms, device_rooms, hub_devices, current_state, logs

## Key Commands
```bash
# Development (from root)
npm run dev              # Starts both client (:8000) and server (:3001)
npm run dev:client       # Client only
npm run dev:server       # Server only

# Build
npm run build            # Builds both client and server

# Production (Pi)
pm2 start ecosystem.config.cjs
pm2 restart thefairies
pm2 logs thefairies

# Tests
cd client && npx playwright test e2e/full-app.spec.ts --reporter=list

# Type checking
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit

# Deploy to Pi
bash deploy-to-pi.sh
```

## Environment Variables (server/.env)
```
PORT=3001
LIFX_TOKEN=              # LIFX API bearer token
FAIRY_DB_PATH=./data/thefairies.sqlite
HUBITAT_TOKEN=            # Hubitat Maker API token
HUB_BASE_URL=             # Hubitat API base URL (e.g. http://192.168.10.204/apps/api/6/devices)
CORS_ORIGIN=              # Allowed CORS origin
LATITUDE=                 # For weather + sun calculations
LONGITUDE=
OPENWEATHER_API=          # OpenWeather API key
API_TIMEOUT=10000
```

## Key Concepts

### Scenes
Scenes contain commands that control multiple devices. Each scene has:
- **rooms**: which rooms it applies to, with priority (higher = wins in motion activation)
- **modes**: which time-of-day modes it's available in
- **commands**: array of typed commands (lifx_light, hubitat_device, twinkly, fairy_device, all_off, mode_update, scene_timer, fairy_scene, lifx_effect)
- **auto_activate**: if true, motion sensors can trigger this scene. If false, manual only.
- **active_from/active_to**: seasonal date range (MM-DD format, optional)

### Motion Handling
Hubitat sends webhook events to POST /hubitat. The motion handler:
1. Finds which room the sensor belongs to (from rooms.sensors JSON)
2. Checks: room.auto enabled, lux threshold (default 500), night lockout, auto_activate
3. Finds the highest-priority scene for the room in the current mode
4. Activates the scene via batch LIFX API calls
5. Starts an inactivity timer (room.timer minutes) when all sensors go inactive
6. One timer per room, not per sensor event

### Night Lockout
Nighttime/Guest Night turns off rooms AND locks them. Locked rooms ignore motion. Unlocks when wake mode is reached (configurable, default: Morning).

### Indicator Lights
- **Subway indicator**: motion sensor triggers → light changes to green/orange/red based on walk-time-aware train status
- **Weather indicator**: periodic or sensor-triggered → light changes colour based on weather condition (customisable colours)

### Sun Mode Scheduler
Automatically transitions modes based on sun position (SunCalc). On server start, catches up to the correct mode. Schedules: nightEnd→Early Morning, dawn→Morning, solarNoon→Afternoon, goldenHour→Evening, dusk→Late Evening, night→Night.

## Common Tasks

### Adding a new scene command type
1. Add to SceneCommand type in `client/src/lib/api.ts`
2. Add to Zod schema in `server/src/routes/scenes.ts`
3. Add execution logic in `server/src/lib/scene-executor.ts`
4. Add UI in scene editor's Devices or Settings tab

### Adding a new API endpoint
1. Add route in appropriate `server/src/routes/*.ts` file
2. Add API method in `client/src/lib/api.ts`
3. Use in a page component with TanStack Query (useQuery/useMutation)

### Modifying the database schema
1. Add migration in `server/src/db/index.ts` (try-catch ALTER TABLE pattern)
2. Update relevant route interfaces and parseX functions
3. Update frontend types in `client/src/lib/api.ts`

## Pi Deployment
- Repo location: ~/thefairies-app
- Process manager: PM2 (ecosystem.config.cjs)
- Database: ~/thefairies-app/server/data/thefairies.sqlite
- External access: Cloudflare tunnel → home.thefairies.ie
- Hubitat webhook: http://192.168.10.201:3001/hubitat

## GitHub
Repository: https://github.com/ux-mark/thefairies-app
