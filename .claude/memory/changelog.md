# Changelog

> Log completed work here during sessions.
> Format: date, what was done, files affected.

---

## 2026-03-26 — Fix remaining audit issues (PR #38)
- **Security**: Webhook token read from X-Hubitat-Token header instead of query param; 3 error message leaks fixed in kasa.ts and lifx.ts
- **Cleanup**: Removed 5 dead migration functions from db/index.ts (already applied to production DB)
- **Deploy**: Added set -e to local shell in deploy-to-pi.sh
- **Dev**: Added HMR dispose hook to socket singleton (prevents duplicate connections during hot reload)
- **Refactor**: Decomposed SettingsPage.tsx from 2173 → 536 lines; extracted 7 components to client/src/components/settings/

## 2026-03-25 — Production readiness: resolve 47 open issues (PR #30)
- **Infrastructure**: Graceful shutdown (SIGTERM/SIGINT), PM2 compiled JS, server build in deploy, deploy script DB backup + health check, .env validation, PM2 restart backoff
- **Security**: Webhook auth + rate limiting, body limit 100KB, Hubitat token as header, preferences allowlist, generic production error messages across all routes
- **Data integrity**: 30-day log auto-pruning, scene cycle detection, atomic room delete + light assignment, weather indicator uses lock state, DELETE /history confirmation + audit, schema table order fix
- **UX error states**: Error + retry on 5 pages, WatchPage loading skeleton, dashboard targeted refetch, 15s client fetch timeout
- **Accessibility**: Notification panel focus return, aria-hidden on emojis, 44px walk-time targets, logs expand label, native button in SceneEditor, HomeSummaryStrip fix
- **UX consistency**: Remove all truncate, standardize empty states, fix ScenesPage accordion, hide duplicate mode badge, LIFX room exclusions during All Off/Nighttime
- **Code quality**: Energy rate debounce, dimmer init from device, Zod validation, /lights route, dead code cleanup, chart.js dedup, N+1 query fix, debug-gated logging, sync POST, 503 on LIFX test
- Files: 40 files (745 insertions, 405 deletions)

## 2026-03-25 — Simplify scene model: remove auto_activate, add default scene UX
- Removed `auto_activate` column from scenes table entirely — every scene is equal
- Renamed `room_auto_scenes` → `room_default_scenes` (table + API + UI)
- All "auto" terminology replaced with "default" throughout
- Scene Editor: new "Default scene" section with per-room+mode radio controls and warnings when replacing existing defaults
- Room Detail: all scenes show radio buttons (no eligibility gating), badge says "Default"
- Homepage: all scenes shown, Activity icon marks default scene
- Motion handler: direct room_default_scenes lookup, no auto_activate filter
- Migration: FK constraints disabled during scenes table recreation; table rename; priority migration picks all scenes
- API renamed: /rooms/default-scenes, /rooms/:name/default-scene
- Files: 10 files (4 server, 6 client)

## 2026-03-24 — Direct Kasa integration via python-kasa sidecar
- Python FastAPI sidecar with python-kasa for direct local-network Kasa device control
- Device discovery (UDP broadcast), 10-second polling, 5-minute DHCP rediscovery
- New kasa_devices SQLite table (MAC-based IDs, emeter data, RSSI, firmware)
- Express HTTP client + poller syncs sidecar state to DB with Socket.io real-time events
- Kasa API routes: device listing, control, discovery, energy stats (daily/monthly from device memory)
- History collector extended for Kasa energy snapshots (power, energy, voltage, current)
- Scene executor supports new `kasa_device` command type with on/off/brightness
- All Off / Nighttime includes Kasa devices via device_rooms kasa_* types
- Hubitat webhook handler skips events for Kasa-managed devices (prevents duplicate data)
- Kasa Setup page at /settings/kasa: device discovery, rename, signal strength, strip outlet view
- DevicesPage shows Kasa devices alongside LIFX lights and hub devices with power/energy data
- DeviceDetailPage supports Kasa devices: voltage, current, runtime, device info, signal strength
- HS300 power strip per-outlet display and control
- PM2 ecosystem config updated for kasa-sidecar process
- Deploy script updated with Python venv setup
- Files: 8 new (4 Python, 4 TypeScript), 14 modified — server/kasa/*, server/src/lib/kasa-client.ts, kasa-poller.ts, server/src/routes/kasa.ts, db/index.ts, index.ts, scene-executor.ts, scenes.ts, system.ts, history-collector.ts, client/src/lib/api.ts, DevicesPage.tsx, DeviceDetailPage.tsx, KasaSetupPage.tsx, SettingsPage.tsx, App.tsx, Badge.tsx, ecosystem.config.cjs, deploy-to-pi.sh, .gitignore

## 2026-03-24 — Standardize UI components for consistency across all pages
- Created 6 shared UI primitives: Accordion, BackLink, Badge (TypeBadge/CountBadge), SearchInput, EmptyState, FilterChip
- Replaced 5 inconsistent accordion/collapsible implementations with one shared Accordion component (consistent ChevronDown, CSS grid animation, card wrapper)
- Made all RoomDetailPage sections collapsible (Settings, Scenes, Room Overview, Devices)
- Created LightDetailPage at /lights/:id for LIFX lights (previously had no detail page)
- Made LIFX light names on DevicesPage link to /lights/:id (was expand-inline; now consistent with hub devices)
- Standardized page headers to text-heading text-sm font-semibold across all listing pages
- Standardized all back navigation to shared BackLink (surface pill style)
- Standardized filter chips to rounded-full pills everywhere
- Standardized search inputs to shared SearchInput with X icon clear button
- Removed uppercase from all badge classes (DevicesPage, RoomDetailPage, LogsPage)
- Fixed LogsPage empty state (added icon and dashed border to match other pages)
- Fixed FilterChip touch target to 44px minimum (WCAG AA)
- Fixed LogsPage back link destination (/settings instead of /)
- Deleted orphaned CollapsibleDeviceGroup component
- Files: 18 files (7 new, 1 deleted, 10 modified) — Accordion.tsx, BackLink.tsx, Badge.tsx, EmptyState.tsx, FilterChip.tsx, SearchInput.tsx, LightDetailPage.tsx, CollapsibleDeviceGroup.tsx (deleted), App.tsx, RoomIntelligence.tsx, DashboardPage.tsx, DeviceDetailPage.tsx, DevicesPage.tsx, HomePage.tsx, LogsPage.tsx, RoomDetailPage.tsx, RoomsPage.tsx, ScenesPage.tsx

## 2026-03-24 — Remove all legacy migration code and dead code
- Removed ~320 lines of try-catch migration blocks from db/index.ts, replaced with clean seedDefaults()
- Fixed scenes CREATE TABLE: added auto_activate, active_from, active_to, last_activated_at (were missing from schema, only added by migrations)
- Deleted server/scripts/ directory (5 legacy migration scripts: seed-from-legacy, migrate-lifx-scenes, assign-lights-to-rooms, fix-light-names, fix-priorities)
- Replaced overloaded SceneCommand.id field with proper typed fields: device_id for hubitat, brightness (number) for fairy devices
- Removed HubDevice.room_name from client type (column was already dropped from DB)
- Removed stale comments referencing old schema in scene-executor, motion-handler, insights-engine, utils
- Updated PROJECT_SPEC.md: document schema-first approach instead of try-catch ALTER TABLE pattern
- Files: 14 files (9 modified, 5 deleted) — db/index.ts, scene-executor.ts, scenes.ts, motion-handler.ts, insights-engine.ts, api.ts, utils.ts, SceneEditorPage.tsx, PROJECT_SPEC.md, plus 5 deleted scripts

## 2026-03-24 — Scenes UX redesign with room+mode organization
- Scenes page rewritten: room-first accordion view with mode pills, Radix Tabs view switcher (By room/Active/Recent/Stale), persistent search across all views
- Default scene detection: highest-priority auto_activate scene for room+mode, marked with filled star
- Room Detail page: new collapsible Scenes section between Settings and Intelligence, collapsed by default
- Homepage: scene buttons sort alphabetically, default star indicator, 44px WCAG touch targets
- New `last_activated_at` column on scenes table, backfilled from logs, updated on every activation
- Shared `scene-utils.ts`: isSceneInSeason, getDefaultScene, isStaleScene, sortScenesByPriority, getScenesForRoom, getModesForRoom
- Stale detection: scenes not activated in 90 days, excluding seasonal scenes
- Files: 8 files (3 server, 5 client) — db/index.ts, scene-executor.ts, scenes.ts, api.ts, scene-utils.ts (new), ScenesPage.tsx, RoomDetailPage.tsx, HomePage.tsx

## 2026-03-24 — Configurable modes with triggers and scheduling
- Modes are now fully configurable: add, rename (cascades to scenes/preferences), delete (cascade with dependency warnings)
- New `mode_triggers` table supports sun-based and time-based triggers per mode
- Sun mode scheduler rewritten from hardcoded map to data-driven (reads triggers from DB)
- New `time-trigger-scheduler` for clock-based mode transitions with day-of-week filtering
- Configurable sleep mode name (replaces hardcoded "Sleep Time" check)
- Settings restructured: new "Modes and schedule" accordion with two-level drill-down
- ModesList shows trigger summaries and next scheduled time at a glance
- ModeDetail: inline rename, trigger toggle/add/delete, dependency-aware delete confirmation
- AddTriggerForm: solar event picker (with "used by" labels) and time picker with day-of-week buttons
- SunScheduleSection removed (trigger info now lives in per-mode ModeDetail)
- Files: 10 files (5 server, 5 client) — db/index.ts, system.ts, sun-mode-scheduler.ts, time-trigger-scheduler.ts (new), index.ts, api.ts, ModesList.tsx (new), ModeDetail.tsx (new), modeUtils.ts (new), SettingsPage.tsx

## 2026-03-24 — LIFX light retry mechanism and notification system
- LIFX `setStates` response now inspected for per-light results (ok/timed_out/offline)
- Failed lights retried individually via `setState` — up to 2 retries, 2s delay, rate limit guard
- New `notifications` table with deduplication via `dedup_key` — repeated failures show as single notification with occurrence count
- Notification service: create with dedup, list, unread count, mark read, dismiss
- 6 API routes for notification CRUD under `/api/system/notifications`
- Socket.io `notification:new` and `notification:update` events for real-time client push
- NotificationBell component in header with unread badge count
- NotificationPanel: slide-out dialog with severity indicators, occurrence counts, mark read/dismiss
- Battery critical (<5%) and low (<15%) events create persistent notifications
- Device errors from notifications surface in Insights AttentionBar
- `device_error` category added to LogsPage filter
- Files: 14 files (7 server, 7 client)

## 2026-03-23 — UX overhaul: layered drill-down, activity tracking, room intelligence
- Energy/battery data surfaced on device cards (power watts, energy kWh, battery %) with sort-by-power/battery options
- Room activity tracking: new room_activity table, motion events recorded, activity insights (room ranking, hourly patterns, daily trends)
- ActivityCard on dashboard: room ranking, peak hours, 7-day activity bar chart
- Room intelligence: new collapsible section on room detail pages showing environment, energy, activity, and battery health per room
- Device detail page restructured: headline insights first (watts comparison, battery prediction, cost impact), then charts, then context, raw attributes collapsed at bottom
- Clickable dashboard summary pills scroll to their corresponding detail cards
- Energy narrative: contextual text explaining whether usage is above/below/normal
- Battery replacement timeline with urgency bands (needs attention/monitor/healthy)
- Dashboard layout: main+side column on desktop (energy/environment/activity + battery/sun)
- Currency symbol configurable in Settings (used for energy cost displays)
- Critical attention banner on home page linking to Insights when issues need attention
- Home page room cards link to Insights for critical alerts
- Files: 14+ files modified across server and client

## 2026-03-23 — Aggregate insights, trend analysis, and attention CTAs
- Insights engine: server-side computation of energy, temperature, lux, and battery analytics with 10-minute cache
- Energy: total watts, over/under comparison to 7-day hourly average, daily cost estimate, device anomaly detection, peak hours
- Temperature: house average, 30-day comparison, warming/cooling trend, room outliers, indoor/outdoor delta
- Lux: house average brightness, level classification, comparison to normal for this hour, room ranking
- Battery: fleet health score, per-device drain rates, predicted days remaining, anomalous drain detection
- Attention bar: prioritised alerts (critical/warning/info) with CTAs linking to device detail pages
- Home summary strip: 4 stat pills (energy, temperature, brightness, battery fleet) with over/under badges and trend arrows
- OverUnderBadge reusable component for percentage comparisons
- Enhanced EnergyCard: anomaly highlights, device links, peak hours, cost estimate
- Enhanced BatteryCard: fleet health, drain rates, predicted replacement, anomalous drain highlights
- Enhanced EnvironmentCard: house average with trend arrow, room outlier highlights, lux section with brightness ranking
- Energy rate preference in Settings for cost estimates
- Files: server/src/lib/insights-engine.ts, server/src/routes/dashboard.ts, client/src/lib/api.ts, client/src/pages/DashboardPage.tsx, client/src/components/dashboard/*.tsx, client/src/pages/SettingsPage.tsx

## 2026-03-23 — Dashboard, device insights, and historical data infrastructure
- New "Insights" page at /dashboard with 4 dashboard cards: Energy, Battery, Environment, Sun and Mode
- Historical data infrastructure: device_history table, 10-minute snapshot collector, indefinite retention
- Hubitat webhook now captures power (watts) and energy (kWh) events from smart plugs
- Dashboard aggregate API endpoint (GET /api/dashboard/summary) reduces frontend from 6+ requests to 1
- History API with time-series aggregation (24h full resolution, 7d+ hourly averages)
- Chart.js integration with reusable TimeSeriesChart component (dark theme, responsive)
- Device detail page at /devices/:id showing full attributes, room/scene context, and history charts
- Data management section in Settings: view DB size, delete history by age/source/all with VACUUM
- Socket.io client integration: real-time dashboard updates on Hubitat events and mode changes
- 6th nav item "Insights" with BarChart3 icon added to sidebar and mobile bottom nav
- User personas documented: Homeowner, Guest, Commuter, Away User
- Files: server/src/db/index.ts, server/src/index.ts, server/src/lib/history-collector.ts, server/src/routes/dashboard.ts, client/src/pages/DashboardPage.tsx, client/src/pages/DeviceDetailPage.tsx, client/src/components/dashboard/*.tsx, client/src/hooks/useSocket.ts, client/src/lib/api.ts, client/src/components/layout/AppLayout.tsx, client/src/App.tsx, client/src/pages/SettingsPage.tsx, client/src/pages/DevicesPage.tsx

## 2026-03-23 — Persist room locks to database + sun scheduler respects Sleep Time
- Room locks now stored in `current_state` table as `locked_rooms` JSON array, surviving server restarts
- On startup, `MotionHandler` constructor loads persisted locks from DB
- Sun mode scheduler skips catch-up and scheduled transitions when mode is "Sleep Time"
- Files: `server/src/lib/motion-handler.ts`, `server/src/lib/sun-mode-scheduler.ts`

## 2026-03-22 — Suppress indicator lights when room is off or locked
- MTA and weather indicator lights now respect room state (locked, auto disabled, manual scene override)
- Motion handler checks room via light_rooms table before triggering indicators
- Weather indicator's periodic timer checks current mode directly (Night/Guest Night) to avoid circular import
- Files: `server/src/lib/motion-handler.ts`, `server/src/lib/weather-indicator.ts`

## 2026-03-22 — Fix weather timeout 500s and PWA preload warnings
- Weather API timeouts now return stale cached data instead of 500 errors
- PWA service worker excludes JS chunks from precache, uses runtime StaleWhileRevalidate caching instead
- Files: `server/src/lib/weather-client.ts`, `client/vite.config.ts`

## 2026-03-22 — Manual scene override persists during motion
- Manually activated scenes (e.g. TV) no longer get overridden by the default auto scene on motion events
- Added `scene_manual` flag to rooms table, set on manual activation, cleared on deactivation/timer expiry
- Files: `server/src/db/index.ts`, `server/src/lib/motion-handler.ts`, `server/src/lib/scene-executor.ts`, `server/src/routes/scenes.ts`

## 2026-03-22 — Rebrand to Home Fairy + new icon
- Renamed all user-facing text from "The Fairies" to "Home Fairy" (sidebar, mobile header, PWA manifest, server startup, package.json)
- Replaced first-draft icon SVG with final design: mushroom-cap cottage with proper fairy wings (scalloped upper lobes, solid lower lobes, vein lines), tilted chimney, arched door, square mullioned windows
- Database filename, PM2 process name, deploy scripts, and domain left unchanged (would break running system)
- Files: `client/public/home-fairy-icon.svg`, `client/src/components/layout/AppLayout.tsx`, `client/vite.config.ts`, `server/src/index.ts`, `package.json`

## 2026-03-22 — MTA indicator logic overhaul
- Fixed `maxWaitMinutes` to represent platform wait tolerance (not departure countdown)
- Status re-evaluates from catchable trains when first train is missed (green/orange instead of always red)
- Indicator light now updates every 30s for walkTime+maxWaitMinutes window instead of single snapshot
- Extracted `MtaIndicatorManager` class — centralised duplicate logic from motion-handler and system routes
- Removed manual duration config from UI (replaced by computed decision window)
- Files: `server/src/lib/mta-client.ts`, `server/src/lib/mta-indicator.ts`, `server/src/lib/motion-handler.ts`, `server/src/routes/system.ts`, `client/src/lib/api.ts`, `client/src/pages/SettingsPage.tsx`

## 2026-03-22 — Scene toggle + sensor filter fix
- Scene buttons on homepage now toggle on/off (deactivate API was already available, just not wired up)
- Fixed WCAG AA contrast for active scene buttons in light mode (`text-fairy-700 dark:text-fairy-300`)
- Added `aria-pressed` to scene toggle buttons
- Filtered sensor-type devices (motion, contact, temperature) from Switches tab in RoomDetailPage
- Created `dev` branch from `main`, feature branch `fix/scene-toggle-and-sensor-filter`
- Files: `client/src/pages/HomePage.tsx`, `client/src/pages/RoomDetailPage.tsx`

## 2026-03-22 — Coding Fairy template migration
- Adopted Coding Fairy agent orchestration template
- Created `.specs/PROJECT_SPEC.md`, `features.md`, `personas.md`
- Moved E2E tests to `.testing/` directory structure
- Set up agent definitions (builder, reviewer, planner)
- Updated `.gitignore` with comprehensive patterns
- Cleaned up stale memory files
