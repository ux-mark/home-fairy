# Project Spec

## Overview
The Fairies v3 — a home automation control system with a React frontend and Express backend. Controls LIFX lights, Kasa smart plugs/strips (via python-kasa sidecar), Hubitat sensors, Twinkly decorative lights, and fairy (ESP8266) devices. Includes MTA subway tracking, weather indicators, energy monitoring, and motion-based scene automation.

## Tech Stack
- **Language**: TypeScript (frontend and backend)
- **Frontend**: React 19, Vite, Tailwind CSS v4, Radix UI, react-colorful (HSV picker), TanStack Query, Socket.io client, PWA
- **Backend**: Express 5, better-sqlite3, Socket.io, axios, Zod validation, SunCalc, gtfs-realtime-bindings
- **Database**: SQLite with WAL mode. Tables: rooms, scenes, scene_rooms, scene_modes, room_auto_scenes, modes, mode_triggers, light_rooms, device_rooms, hub_devices, kasa_devices, current_state, logs, device_history, room_activity, notifications
- **Package manager**: npm
- **Process manager (production)**: PM2

## Project Structure
```
thefairies-app/
├── client/          React + Vite + TypeScript + Tailwind CSS v4
│   ├── src/
│   │   ├── pages/          Home, Dashboard, Rooms, RoomDetail, Scenes, SceneEditor, Devices, DeviceDetail, Settings, Watch, Logs
│   │   ├── components/     Layout (AppLayout, WatchLayout) + UI + dashboard cards
│   │   ├── hooks/          useToast, useTheme
│   │   └── lib/            api.ts (API client + types), utils.ts
│   └── vite.config.ts      Vite config with PWA + proxy to :3001
├── server/          Express 5 + TypeScript + SQLite (better-sqlite3)
│   ├── src/
│   │   ├── routes/         lifx, rooms, scenes, lights, hubitat, kasa, motion, system, dashboard
│   │   ├── lib/            lifx-client, hubitat-client, kasa-client, kasa-poller,
│   │   │                   twinkly-client, fairy-device-client,
│   │   │                   scene-executor, motion-handler, timer-manager, sun-mode-scheduler,
│   │   │                   weather-client, weather-indicator, mta-client, mta-stops,
│   │   │                   history-collector
│   │   ├── db/             SQLite setup + migrations
│   │   └── index.ts        Express server entry point
│   ├── kasa/               Python FastAPI sidecar for Kasa device management
│   │   ├── main.py         FastAPI app entry point
│   │   ├── device_manager.py  Discovery, connections, polling
│   │   ├── models.py       Pydantic response models
│   │   └── requirements.txt Python dependencies
│   ├── data/               SQLite database (gitignored)
│   └── .env                Environment variables (gitignored)
├── .testing/        Playwright E2E tests (see E2E Tests section below)
└── deploy-to-pi.sh         Deployment script for Raspberry Pi
```

## Conventions

### Code Style
- TypeScript strict mode
- Mobile-first dark theme (slate-950 + emerald/fairy-500 accent)
- Radix UI primitives for interactive components
- TanStack Query for server state management

### File Organization
- Frontend pages in `client/src/pages/`
- Shared types in `client/src/lib/api.ts`
- Backend routes in `server/src/routes/`
- Backend services in `server/src/lib/`

### Testing

#### Unit Tests
- Framework: (not yet configured)
- Test location: (TBD)
- Command: (TBD)
- Naming convention: (TBD)

#### E2E Tests (Playwright)
- Config location: `.testing/playwright.config.ts`
- Test location: `.testing/tests/`
- Page objects location: `.testing/pages/`
- Fixtures location: `.testing/fixtures/`
- Screenshots/traces location: `.testing/results/`
- Visual regression baselines: `.testing/baselines/`
- Command: `npx playwright test --config .testing/playwright.config.ts`
- Smoke command: `npx playwright test --config .testing/playwright.config.ts --grep @smoke`
- Base URL: `http://localhost:8000`
- Browsers: chromium (Mobile 375x812, Desktop 1280x720)

## Commands
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
npx playwright test --config .testing/playwright.config.ts --reporter=list

# Type checking
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit

# Lint
cd client && npx eslint .

# Deploy to Pi
bash deploy-to-pi.sh
```

## UI/UX Standards
- Component library: Radix UI
- Design tokens: Tailwind CSS v4
- Accessibility standard: WCAG 2.2 AA
- Design: Mobile-first dark theme, Apple Watch view at /watch

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
KASA_SIDECAR_URL=         # Kasa sidecar URL (default: http://127.0.0.1:3002)
```

## Key Concepts

### Scenes
Scenes contain commands that control multiple devices. Each scene has:
- **rooms**: which rooms it applies to
- **modes**: which time-of-day modes it's available in
- **commands**: array of typed commands (lifx_light, hubitat_device, twinkly, fairy_device, all_off, mode_update, scene_timer, fairy_scene, lifx_effect)
- **auto_activate**: if true, motion sensors can trigger this scene. If false, manual only.
- **active_from/active_to**: seasonal date range (MM-DD format, optional)

### Motion Handling
Hubitat sends webhook events to POST /hubitat. The motion handler:
1. Finds which room the sensor belongs to (from device_rooms table)
2. Checks: room.auto enabled, lux threshold (default 500), night lockout, auto_activate
3. Looks up the designated auto scene for the room+mode from room_auto_scenes table
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
1. Update the CREATE TABLE statement in `server/src/db/index.ts`
2. Update relevant route interfaces and parseX functions
3. Update frontend types in `client/src/lib/api.ts`
4. Delete and recreate the local database to apply schema changes

## Architecture Notes
- Monorepo: `client/` (React SPA) + `server/` (Express API)
- Client proxies API requests to `:3001` via Vite dev server config
- Real-time updates via Socket.io
- No user auth — relies on local network trust and CORS origin whitelisting

## Pi Deployment
- Repo location: ~/thefairies-app
- Process manager: PM2 (ecosystem.config.cjs)
- Database: ~/thefairies-app/server/data/thefairies.sqlite
- External access: Cloudflare tunnel → home.thefairies.ie
- Hubitat webhook: http://192.168.10.201:3001/hubitat

## GitHub
Repository: https://github.com/ux-mark/thefairies-app

## Known Constraints
- @playwright/test is installed in `client/` (run playwright commands from `client/` or ensure the binary is accessible)
- SQLite database is local-only — no replication
- No user authentication
