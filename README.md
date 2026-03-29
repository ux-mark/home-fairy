# Home Fairy

A local home automation control system built for Raspberry Pi. Controls LIFX lights, TP-Link Kasa smart plugs and power strips, Hubitat sensors, Twinkly decorative lights, and ESP8266 fairy devices. Includes energy monitoring, MTA subway tracking, weather indicators, and motion-based scene automation.

## Architecture

```
                          Local Network
                     +-----------------------+
                     |                       |
React SPA (PWA) --> Express API (port 3001)  |
                     |       |               |
                     |  SQLite (better-sqlite3)
                     |       |               |
                     |  Kasa Sidecar (port 3002) --> TP-Link Kasa devices
                     |       |               |
                     |  Hubitat Hub ----------+--> Motion sensors, contact sensors
                     |       |               |
                     |  LIFX Cloud API ------+--> LIFX lights
                     +-----------------------+
```

Two PM2-managed processes run on the Pi:

- **thefairies** (port 3001) -- Express server with React SPA, SQLite database, Socket.io for real-time updates
- **kasa-sidecar** (port 3002) -- Python FastAPI service using python-kasa for direct local Kasa device communication

## Prerequisites

- **Raspberry Pi** (or any Linux machine) with Node.js 20+ and Python 3.11+
- **npm** and **pip3** (both come pre-installed on Raspberry Pi OS)
- **PM2** for process management (`npm install -g pm2`)

### Optional integrations

- **LIFX lights** -- requires a LIFX API token from https://cloud.lifx.com/settings
- **Hubitat hub** -- requires a Maker API token and the hub's IP address
- **OpenWeather** -- requires an API key for weather data and indicators
- **TP-Link Kasa devices** -- discovered automatically on the local network, no account needed

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/ux-mark/home-fairy.git
cd home-fairy
npm run install:all
```

### 2. Set up the Kasa sidecar

```bash
cd server/kasa
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cd ../..
```

### 3. Configure environment

Create `server/.env`:

```
PORT=3001
LIFX_TOKEN=your-lifx-token
FAIRY_DB_PATH=./data/thefairies.sqlite
HUBITAT_TOKEN=your-hubitat-maker-api-token
HUB_BASE_URL=http://your-hubitat-ip/apps/api/6/devices
CORS_ORIGIN=http://your-pi-ip:3001
LATITUDE=your-latitude
LONGITUDE=your-longitude
OPENWEATHER_API=your-openweather-key
API_TIMEOUT=10000
```

All integrations are optional. Leave a token blank to skip that integration.

### 4. Build and start

```bash
# Build the React client
cd client && npx vite build && cd ..

# Start both services with PM2
pm2 start ecosystem.config.cjs
pm2 save

# Enable auto-restart on reboot
pm2 startup
# Then run the command PM2 prints (requires sudo)
```

Open `http://your-pi-ip:3001` in a browser.

## Development

```bash
# Start both client (port 8000) and server (port 3001) in dev mode
npm run dev

# Start the Kasa sidecar separately (in another terminal)
cd server/kasa
venv/bin/uvicorn main:app --host 127.0.0.1 --port 3002 --reload
```

The Vite dev server proxies API requests to the Express server. Hot reload works for both client and server.

## Deployment to Pi

If you develop on another machine and deploy to the Pi:

```bash
bash deploy-to-pi.sh
```

This copies the database, installs dependencies, sets up the Python venv, builds the client, and starts both PM2 processes. Edit `PI_HOST` in the script to match your Pi's address.

## Project structure

```
home-fairy/
  client/              React + Vite + Tailwind CSS v4
    src/
      pages/           Home, Rooms, Scenes, Devices, Insights, Settings, Watch
      components/      Layout, UI primitives, dashboard cards
      lib/             API client + types, utilities
  server/              Express 5 + TypeScript + SQLite
    src/
      routes/          API routes (lifx, rooms, scenes, hubitat, kasa, dashboard, system)
      lib/             Device clients, scene executor, motion handler, schedulers
      db/              SQLite schema and helpers
    kasa/              Python FastAPI sidecar
      main.py          FastAPI app
      device_manager.py  Discovery, polling, device control
    data/              SQLite database (gitignored)
  .specs/              Project spec, features log, personas
  .testing/            Playwright E2E tests
  ecosystem.config.cjs PM2 process configuration
  deploy-to-pi.sh      Remote deployment script
```

## Key features

- **Scene automation** -- define scenes with commands for any combination of lights, plugs, and devices. Scenes activate automatically via motion sensors based on time of day.
- **Energy monitoring** -- real-time power, voltage, and current from Kasa devices. Per-outlet tracking on HS300 power strips. Historical charts, cost estimates, and anomaly detection.
- **Insights dashboard** -- energy usage, temperature trends, battery health, room activity patterns, and attention alerts.
- **Motion handling** -- Hubitat motion sensors trigger scenes based on room, time of day, and lux levels. Rooms lock during night modes.
- **Mode scheduling** -- automatic mode transitions based on sun position (dawn, noon, dusk, etc.) or clock time with day-of-week filters.
- **MTA subway tracking** -- real-time train arrivals with walk-time-aware indicator lights.
- **Weather indicators** -- LIFX lights change colour based on weather conditions.
- **PWA** -- installable as a home screen app. Includes an Apple Watch-optimised view at `/watch`.

## Tech stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Radix UI, TanStack Query, Socket.io, Chart.js
- **Backend**: Express 5, TypeScript, better-sqlite3, Socket.io, Zod
- **Kasa sidecar**: Python 3, FastAPI, python-kasa
- **Process manager**: PM2
- **Database**: SQLite (WAL mode)
