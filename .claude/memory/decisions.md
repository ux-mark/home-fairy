# Architectural Decisions

> Log architectural and technical decisions here during work sessions.
> Format: date, decision, rationale, alternatives considered.

---

## 2026-03-24 — Direct Kasa integration via python-kasa sidecar
- Replaced Hubitat-mediated Kasa device control with direct local-network communication
- Python FastAPI sidecar (port 3002) using python-kasa library for device discovery, control, and energy monitoring
- PM2 manages both Express (3001) and sidecar (3002) processes
- Devices identified by MAC address (stable across DHCP); 5-minute rediscovery loop for IP changes
- New `kasa_devices` table separate from `hub_devices` (different data model: MAC-based ID, emeter fields, RSSI, firmware)
- Kasa energy data uses same `power`/`energy` source names in device_history — insights engine works unchanged
- New sources: `voltage`, `current` for data Hubitat never provided
- HS300 power strips: per-outlet control and energy monitoring via child device IDs (`{PARENT_MAC}_{INDEX}`)
- 10-second Express-side poller syncs sidecar state to SQLite, emits Socket.io events for real-time UI
- Hubitat webhook handler skips events for devices managed by Kasa sidecar (label match)
- Kasa devices in scenes via new `kasa_device` command type; All Off includes Kasa devices
- Rationale: Hubitat added unnecessary failure point; python-kasa provides voltage/current/daily-monthly stats/per-outlet monitoring/runtime tracking that Hubitat cannot
- Alternatives considered: tplink-smarthome-api (Node.js) — rejected, unmaintained 2+ years, lacks KLAP/AES encryption support

## 2026-03-23 — Dashboard and historical data architecture
- New dedicated Insights page (not on homepage) for device data, energy, battery, environment
- Homepage stays focused on scene control and subway — dashboard data is separate
- Chart.js + react-chartjs-2 for visualizations (180KB, cached by PWA service worker)
- Historical data stored indefinitely at 10-minute resolution — no retention limits
- User manages data deletion via Settings (clear all, by age, by source)
- device_history table with composite index on (source, source_id, recorded_at)
- Aggregate dashboard endpoint reduces N API calls to 1
- Socket.io used for real-time cache invalidation (not data transport)
- Rationale: Pi has ample disk for years of data (~100MB/year), SQLite handles millions of rows

## 2026-03-22 — Adopted Coding Fairy template
- Migrated project to use the Coding Fairy agent orchestration template
- Moved E2E tests from `client/e2e/` to `.testing/tests/`
- Moved Playwright config from `client/playwright.config.ts` to `.testing/playwright.config.ts`
- Created `.specs/PROJECT_SPEC.md` from existing CLAUDE.md content
- Rationale: Standardised agent workflow, better test organisation, spec-first protocol
