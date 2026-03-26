# Architectural Decisions

> Log architectural and technical decisions here during work sessions.
> Format: date, decision, rationale, alternatives considered.

---

## 2026-03-26 — Sonos integration via node-sonos-http-api
- Phase 1: Follow-Me Music + Auto-Play Rules
- node-sonos-http-api (localhost:5005) as REST gateway to Sonos, managed via PM2
- Follow-me music: motion sensors trigger speaker grouping/ungrouping. Single group model (all active rooms hear same music). Per-room opt-in/out via rooms.sonos_follow_me column.
- Auto-play: configurable rules in sonos_auto_play table, triggered on mode changes with conditions (always, if-not-playing, if-source-not)
- Line-in detection: any speaker with active line-in (TV, turntable, amp) auto-excluded from follow-me — source-based, not device-type-based
- Locked state (Nighttime/Guest Night) pauses follow-me and clears active rooms
- sonos_speakers table maps Home Fairy rooms to Sonos speaker names, with per-room favourite override
- Integration hooks: fire-and-forget calls from motion-handler, system.ts (mode change + locked state), sun/time schedulers
- Frontend: dedicated /sonos-setup page (auto-discovery), /sonos/:speaker detail page, Sonos tab on Devices page, Music section in Settings, per-room controls on Room Detail
- Rationale: leverages existing motion infrastructure; node-sonos-http-api is the most stable Sonos REST API; single-group model is simplest correct UX for Phase 1
- Phase 2 (future): independent zones per room, Spotify integration

## 2026-03-25 — Simplify scene model: every scene is equal, one default per room+mode
- Scene priority (0-100) AND `auto_activate` flag both removed — no auto/manual distinction
- Every scene is just a scene. Any scene can be the default for a room+mode.
- `room_default_scenes` table: one default scene per room+mode combo, enforced by composite PK
- Default scene activates on motion. User can manually activate any other scene; motion won't overwrite it. After inactivity timeout, next motion triggers the default again.
- Default scene assignment available from both Scene Editor (new section with replacement warnings) and Room Detail page (radio controls)
- Rationale: `auto_activate` created a confusing two-layer gating system on top of the already-correct `room_default_scenes` table
- Alternatives considered: keeping auto_activate as eligibility gate — rejected because it clouded the simple mental model

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
