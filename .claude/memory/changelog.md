# Changelog

> Log completed work here during sessions.
> Format: date, what was done, files affected.

---

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
