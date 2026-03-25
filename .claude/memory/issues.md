# Known Issues

> Track bugs, tech debt, and problems discovered during sessions.
> Format: date discovered, description, severity, status (open/resolved/wontfix).

---

# Production Readiness Audit (2026-03-25)

**Status: ALL 47 ISSUES RESOLVED in PR #30 (2026-03-25)**

The following issues were discovered during a comprehensive technical and UX audit of the entire codebase. They are grouped by category and ordered by severity within each category. All issues below have been resolved unless individually marked otherwise.

---

## Infrastructure & Deployment

### 2026-03-25 — No graceful shutdown handling (SIGTERM/SIGINT)
- **Severity**: high
- **Status**: open
- **Category**: process-management
- **Description**: The server registers no `SIGTERM` or `SIGINT` handlers. PM2 sends `SIGTERM` before killing a process. Without a handler, all background intervals (`historyCollector`, `kasaPoller`, `weatherIndicator`, `sunModeScheduler`, `timeTriggerScheduler`) continue running until force-killed. SQLite WAL is not flushed cleanly. Stop functions exist on several modules but are never called on shutdown.
- **Impact**: Likely root cause of PM2 restart instability. Each unclean exit risks SQLite WAL corruption on the Pi's SD card. Timer state is lost without notification.
- **Fix**: Add `process.on('SIGTERM/SIGINT')` handler in `server/src/index.ts` that calls all `stop*()` functions, closes Socket.io, closes the HTTP server, then `db.close()` before `process.exit(0)`.
- **Files**: `server/src/index.ts`

### 2026-03-25 — Running TypeScript via `tsx` in production
- **Severity**: high
- **Status**: open
- **Category**: deployment
- **Description**: `ecosystem.config.cjs` and `deploy-to-pi.sh` configure PM2 to run `tsx src/index.ts` — a dev tool for on-the-fly TypeScript transpilation. The server already has a `tsc` build step and a `node dist/index.js` start script, but neither is used by PM2.
- **Impact**: Higher memory usage on a memory-constrained Pi; slower startup; TypeScript type errors are silent in production; dev dependency in the production execution path.
- **Fix**: Change PM2 `script` to `dist/index.js`. Ensure `deploy-to-pi.sh` runs `npm run build --prefix server` before starting PM2.
- **Files**: `ecosystem.config.cjs`, `deploy-to-pi.sh`

### 2026-03-25 — Server build not run during deployment
- **Severity**: high
- **Status**: open
- **Category**: deployment
- **Description**: `deploy-to-pi.sh` builds the client (`npx vite build`) but never builds the server. Masked by the `tsx` issue above, but if PM2 is fixed to use compiled output, deployments would serve stale compiled code.
- **Impact**: Server code changes not reflected in production until manually rebuilt.
- **Fix**: Add `npm run build --prefix server` to the deploy script after the client build step.
- **Files**: `deploy-to-pi.sh`

### 2026-03-25 — Deploy script has no error handling or rollback
- **Severity**: medium
- **Status**: open
- **Category**: deployment
- **Description**: No `set -e` in the outer shell script. If `scp` fails, SSH block runs with a missing or partial database. No pre-deploy backup. No post-deploy health check. `ecosystem.config.cjs` is overwritten every deploy, discarding manual Pi tweaks.
- **Impact**: Failed deploy can leave the app stopped with no automatic recovery.
- **Fix**: Add `set -e` at the top. Add SQLite backup step before copy. Add health check after `pm2 start`. Stop overwriting `ecosystem.config.cjs`.
- **Files**: `deploy-to-pi.sh`

### 2026-03-25 — PM2 config missing restart back-off and log path consistency
- **Severity**: medium
- **Status**: open
- **Category**: process-management
- **Description**: Neither committed nor deployed PM2 config sets `restart_delay` or `exp_backoff_restart_delay`. PM2 restarts a crashing process immediately in a tight loop. Committed config and deployed config differ on log paths.
- **Impact**: Crash loops burn CPU and generate log spam. Log location confusion.
- **Fix**: Add `exp_backoff_restart_delay: 1000` and `max_restarts: 10`. Unify committed and deployed configs.
- **Files**: `ecosystem.config.cjs`

### 2026-03-25 — Missing environment variables in `.env.example`
- **Severity**: high
- **Status**: open
- **Category**: deployment
- **Description**: `.env.example` documents only 6 of ~10 required variables. Missing: `OPENWEATHER_API`, `LATITUDE`, `LONGITUDE`, `KASA_SIDECAR_URL`. No startup validation — missing vars cause silent failures (broken weather, broken sun scheduling, `Bearer undefined` LIFX auth header).
- **Impact**: Fresh deployment silently broken across multiple features. No helpful error message on startup.
- **Fix**: Add all missing variables to `.env.example`. Add startup validation that checks required vars and throws a clear error if absent.
- **Files**: `server/.env.example`, `server/src/index.ts`

---

## Security

### 2026-03-25 — Hubitat webhook has no authentication and is publicly reachable
- **Severity**: high
- **Status**: open
- **Category**: security
- **Description**: `POST /hubitat` accepts requests with no authentication, no rate limiting, and no IP allowlist. Via the Cloudflare tunnel, this endpoint is reachable from the public internet. Any actor who discovers the URL can send arbitrary motion/power/battery events, triggering scene changes and writing to the database.
- **Impact**: An attacker can trigger scene activations, fill the database with junk data, and stress the SD card with repeated writes.
- **Fix**: Add a shared secret header validation (e.g. `X-Hubitat-Token` checked against `process.env.HUBITAT_WEBHOOK_SECRET`). Add `express-rate-limit` on the `/hubitat` route. Reduce the global body limit from 10MB to 100KB.
- **Files**: `server/src/index.ts`

### 2026-03-25 — Hubitat token sent as URL query parameter
- **Severity**: medium
- **Status**: open
- **Category**: security
- **Description**: `hubitat-client.ts` sends `access_token` as a URL query parameter. Query params appear in server logs, proxy logs, and browser history. The Hubitat Maker API supports header-based auth.
- **Impact**: Token leaks into every access log. Lower risk on a home network but poor practice.
- **Fix**: Pass as `Authorization: Bearer` header instead.
- **Files**: `server/src/lib/hubitat-client.ts`

### 2026-03-25 — Preferences endpoint accepts arbitrary key names without allowlist
- **Severity**: medium
- **Status**: open
- **Category**: security
- **Description**: `PUT /preferences` accepts any `key` string and writes `pref_{key}` to `current_state`. No schema validation or allowlist. A client can write any `pref_*` key with any value, including extremely long strings.
- **Impact**: Any client can create or overwrite system preferences. No length limit enables database bloat.
- **Fix**: Validate `key` against an explicit allowlist of valid preference keys. Limit `value` length.
- **Files**: `server/src/routes/system.ts`

### 2026-03-25 — Internal error messages exposed in 500 responses
- **Severity**: low
- **Status**: open
- **Category**: security
- **Description**: All catch blocks return `err.message` directly to the client. Raw SQLite errors, file paths, and library errors are sent in API responses.
- **Impact**: Internal DB schema and file structure revealed to anyone with network access.
- **Fix**: Log full error server-side; return generic "Internal server error" to clients in production.
- **Files**: All route files

### 2026-03-25 — Global request body limit too permissive (10MB)
- **Severity**: medium
- **Status**: open
- **Category**: security
- **Description**: `express.json({ limit: '10mb' })` is applied globally. No legitimate request exceeds a few KB. The Hubitat webhook receives payloads of a few hundred bytes.
- **Impact**: Malicious or buggy client can send 10MB JSON bodies, causing excessive memory allocation and potential OOM on the Pi.
- **Fix**: Reduce global limit to `100kb`. Apply higher limit only to specific routes that need it.
- **Files**: `server/src/index.ts`

---

## Data Integrity

### 2026-03-25 — Unbounded database growth (device_history, logs, room_activity)
- **Severity**: high
- **Status**: open
- **Category**: data-integrity
- **Description**: Three tables grow without any automated pruning. `device_history` gains ~1,300 rows/day (~470k/year). `logs` gains thousands of rows/day from motion/illuminance events. `room_activity` written on every motion event with no TTL. Database already 6.7MB after two days.
- **Impact**: Will slow SQLite queries, consume SD card space, and increase backup times. Manual deletion exists but requires user intervention.
- **Fix**: Add an automated cleanup job in `history-collector.ts` that runs daily and deletes rows older than a configurable retention period (e.g. 90 days for history, 30 days for logs). Add `FAIRY_HISTORY_RETENTION_DAYS` to `.env.example`.
- **Files**: `server/src/lib/history-collector.ts`, `server/src/db/index.ts`

### 2026-03-25 — Scene chaining has no cycle detection
- **Severity**: medium
- **Status**: open
- **Category**: data-integrity
- **Description**: The `fairy_scene` command type calls `activateScene()` recursively. No guard against circular references (Scene A -> Scene B -> Scene A). This would create infinite recursion, exhausting the call stack and crashing the Node process.
- **Impact**: A misconfigured scene chain crashes the server.
- **Fix**: Pass a `Set<string>` of visited scene names through the call stack and throw if a cycle is detected.
- **Files**: `server/src/lib/scene-executor.ts`

### 2026-03-25 — Room delete is not atomic (two independent queries)
- **Severity**: medium
- **Status**: open
- **Category**: data-integrity
- **Description**: Deleting a room executes `DELETE FROM light_rooms` then `DELETE FROM rooms` as separate `run()` calls, not wrapped in a transaction. `device_rooms` rows are not deleted either (no FK cascade).
- **Impact**: Process crash between statements leaves orphaned records.
- **Fix**: Wrap in `db.transaction()`. Add `device_rooms` cleanup.
- **Files**: `server/src/routes/rooms.ts`

### 2026-03-25 — Light room assignment replace is not atomic
- **Severity**: medium
- **Status**: open
- **Category**: data-integrity
- **Description**: `POST /lights/rooms` deletes all existing light-room assignments then inserts new ones. Delete and N inserts are individual `run()` calls outside a transaction.
- **Impact**: Process crash mid-insert leaves a room with partial or no light assignments.
- **Fix**: Wrap delete + insert loop in `db.transaction()`.
- **Files**: `server/src/routes/lights.ts`

### 2026-03-25 — `mode_triggers` table created before `modes` table in schema
- **Severity**: low
- **Status**: open
- **Category**: data-integrity
- **Description**: `mode_triggers` has a FK referencing `modes(name)` but `modes` CREATE TABLE comes after. Currently masked by SQLite's lenient FK enforcement on CREATE, but semantically incorrect.
- **Fix**: Move `modes` table definition before `mode_triggers` in `db.exec()`.
- **Files**: `server/src/db/index.ts`

### 2026-03-25 — No database migration strategy
- **Severity**: medium
- **Status**: open
- **Category**: data-integrity
- **Description**: All tables use `CREATE TABLE IF NOT EXISTS`. No migration runner, no schema version tracking. Adding a column requires manually altering the table on the Pi or resetting the database.
- **Impact**: Any schema change requires manual intervention or data loss.
- **Fix**: Add a simple migration system (e.g. `schema_migrations` table with numbered migration functions).
- **Files**: `server/src/db/index.ts`

---

## Reliability

### 2026-03-25 — Weather indicator uses hardcoded mode names instead of lock state
- **Severity**: medium
- **Status**: open
- **Category**: reliability
- **Description**: `weather-indicator.ts` checks mode names `'Night'` and `'Guest Night'` hardcoded. The motion handler uses `isRoomLocked()` which checks persisted lock state regardless of mode name. If the user renames these modes, the weather indicator continues activating during night conditions.
- **Fix**: Use `motionHandler.isRoomLocked()` or `isIndicatorLightBlocked()` instead of comparing mode name strings.
- **Files**: `server/src/lib/weather-indicator.ts`

### 2026-03-25 — VACUUM blocks the event loop on data deletion
- **Severity**: medium
- **Status**: open
- **Category**: reliability
- **Description**: `DELETE /history` calls `db.exec('VACUUM')` synchronously. On a Pi with a large database, VACUUM can take several seconds, blocking all other requests.
- **Impact**: Server unresponsive during VACUUM.
- **Fix**: Either skip VACUUM (WAL checkpoint is sufficient), or accept it as an admin-only rare operation and document the latency.
- **Files**: `server/src/routes/dashboard.ts`

### 2026-03-25 — DELETE /history has no audit log or confirmation guard
- **Severity**: medium
- **Status**: open
- **Category**: reliability
- **Description**: `DELETE /history` accepts `{ all: true }` and deletes the entire `device_history` table. No auth, no confirmation token, no audit log entry.
- **Impact**: Accidental or malicious full data loss.
- **Fix**: Add audit log entry. Consider requiring a confirmation string in the request body.
- **Files**: `server/src/routes/dashboard.ts`

### 2026-03-25 — Initial setTimeout in pollers not clearable on fast shutdown
- **Severity**: low
- **Status**: open
- **Category**: reliability
- **Description**: `startKasaPoller` and `startHistoryCollector` use a `setTimeout` for initial delay. The return value is not stored, so calling `stop*()` within the delay window doesn't prevent the interval from being established.
- **Fix**: Store the `setTimeout` handle and clear it in `stop*()`.
- **Files**: `server/src/lib/kasa-poller.ts`, `server/src/lib/history-collector.ts`

---

## API Design

### 2026-03-25 — `GET /hubitat/devices/sync` uses GET for a state-mutating operation
- **Severity**: low
- **Status**: open
- **Category**: api-design
- **Description**: Sync endpoint modifies the database (upserts and deletes hub devices) but uses HTTP GET. Proxies may cache GET responses.
- **Fix**: Change to `POST /api/hubitat/devices/sync`.
- **Files**: `server/src/routes/hubitat.ts`

### 2026-03-25 — `POST /lifx/test` returns 200 on error
- **Severity**: low
- **Status**: open
- **Category**: api-design
- **Description**: Returns `{ success: false }` with a 200 status code when LIFX is unreachable. Clients checking HTTP status will think it succeeded.
- **Fix**: Return `res.status(503).json(...)` when LIFX is unreachable.
- **Files**: `server/src/routes/lifx.ts`

### 2026-03-25 — `POST /hubitat/device-rooms` has no Zod schema
- **Severity**: medium
- **Status**: open
- **Category**: api-design
- **Description**: Uses manual if-check instead of Zod validation. `device_type` is not validated against the allowed enum. Invalid values cause a raw SQLite error surfaced as a 500.
- **Fix**: Replace with a Zod schema that validates all fields and `device_type` against the enum.
- **Files**: `server/src/routes/hubitat.ts`

---

## UX: Accessibility

### 2026-03-25 — Notification panel does not return focus to bell button on close
- **Severity**: high
- **Status**: open
- **Category**: accessibility
- **Description**: When the notification panel opens, focus moves to the panel. On close (Escape or outside click), focus is not returned to the `NotificationBell` button. WCAG 2.4.3 requires focus to be managed logically when popups close.
- **Impact**: Keyboard and screen reader users lose their place in the page.
- **Fix**: Pass `returnFocusRef` from `NotificationBell` to `NotificationPanel` and call `buttonRef.current?.focus()` on close.
- **Files**: `client/src/components/notifications/NotificationBell.tsx`, `client/src/components/notifications/NotificationPanel.tsx`

### 2026-03-25 — Scene icons rendered as raw emoji without aria-hidden
- **Severity**: medium
- **Status**: open
- **Category**: accessibility
- **Description**: Scene icons are emoji strings rendered directly into the DOM without `aria-hidden="true"`. Screen readers announce them (e.g. "moon symbol Nighttime"), doubling the spoken text. `LightDetailPage` correctly uses `aria-hidden` but `HomePage`, `WatchPage`, `ScenesPage`, `RoomDetailPage` do not.
- **Impact**: Screen reader users hear redundant emoji names. Inconsistent emoji rendering across platforms.
- **Fix**: Add `aria-hidden="true"` to all emoji `<span>` elements. Long-term: migrate to named icon system from Lucide.
- **Files**: `client/src/pages/HomePage.tsx`, `client/src/pages/WatchPage.tsx`, `client/src/pages/ScenesPage.tsx`, `client/src/pages/RoomDetailPage.tsx`

### 2026-03-25 — Walk-time stepper buttons below 44px touch target
- **Severity**: medium
- **Status**: open
- **Category**: accessibility
- **Description**: MTA walk time +/- buttons are `h-8 w-8` (32x32px). WCAG 2.2 and project standards require 44x44px minimum for touch targets.
- **Impact**: Hard to tap on mobile, especially for the Commuter persona setting up subway stops.
- **Fix**: Change to `min-h-[44px] min-w-[44px]`.
- **Files**: `client/src/pages/SettingsPage.tsx`

### 2026-03-25 — LogsPage expand button missing accessible label
- **Severity**: low
- **Status**: open
- **Category**: accessibility
- **Description**: Expand/collapse chevron button in `LogEntry` has no `aria-label`. When disabled (no debug data), it is invisible but still in the tab order.
- **Fix**: Add `aria-label="Expand/Collapse log details"`. Add `aria-hidden` and `tabIndex={-1}` when disabled.
- **Files**: `client/src/pages/LogsPage.tsx`

### 2026-03-25 — `div role="button"` used instead of native button in SceneEditorPage
- **Severity**: low
- **Status**: open
- **Category**: accessibility
- **Description**: `LightEditorCard` header uses `<div role="button">` instead of `<button>`. Custom keyboard handler only handles Enter and Space but misses form submission prevention.
- **Fix**: Replace with `<button type="button">`.
- **Files**: `client/src/pages/SceneEditorPage.tsx`

### 2026-03-25 — HomeSummaryStrip has nested interactive elements
- **Severity**: low
- **Status**: open
- **Category**: accessibility
- **Description**: `Pill` component wraps a `<section>` with a click handler containing a `<button>` with the same handler. The outer `<section>` is not focusable, making it mouse-only.
- **Fix**: Remove click from `<section>`, make `<button>` fill the card area, or replace entire `Pill` with a `<button>`.
- **Files**: `client/src/components/dashboard/HomeSummaryStrip.tsx`

---

## UX: State Handling

### 2026-03-25 — Missing error states on multiple key pages
- **Severity**: high
- **Status**: open
- **Category**: ux-state
- **Description**: `RoomsPage`, `ScenesPage`, `HomePage`, `LightsPage`, and `WatchPage` have no `isError` handling on their `useQuery` calls. When the API is unreachable (network loss, server restart, Cloudflare tunnel outage), these pages silently show empty states (e.g. "No rooms yet") instead of telling the user something is wrong.
- **Impact**: Critical for the Away User who needs to know if data is stale vs the API being down. Misleading empty state copy ("Tap 'Add Room' to create your first room") is actively wrong in error conditions. The Commuter seeing a blank WatchPage with no feedback is the worst outcome for that persona.
- **Fix**: Destructure `isError` from each `useQuery` and render an inline error state with retry button (similar to `DashboardPage`'s `DashboardError` component).
- **Files**: `client/src/pages/RoomsPage.tsx`, `client/src/pages/ScenesPage.tsx`, `client/src/pages/HomePage.tsx`, `client/src/pages/LightsPage.tsx`, `client/src/pages/WatchPage.tsx`

### 2026-03-25 — WatchPage has no loading or error states at all
- **Severity**: high
- **Status**: open
- **Category**: ux-state
- **Description**: The Commuter's primary interface (`/watch`) has no loading indicator, no error message, no skeleton. A blank screen with no feedback is the worst possible outcome for a persona using the app for 2-3 seconds while rushing.
- **Fix**: Add skeleton for loading state and minimal inline error with retry for error state.
- **Files**: `client/src/pages/WatchPage.tsx`

### 2026-03-25 — Dashboard error recovery uses full page reload instead of targeted refetch
- **Severity**: low
- **Status**: open
- **Category**: ux-state
- **Description**: `DashboardPage`'s retry button calls `window.location.reload()`, resetting all app state (open accordions, filters, scroll position).
- **Fix**: Replace with `queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })`.
- **Files**: `client/src/pages/DashboardPage.tsx`

---

## UX: Microcopy & Consistency

### 2026-03-25 — `truncate` used on user-visible labels across the app (banned by standards)
- **Severity**: high
- **Status**: open
- **Category**: ux-microcopy
- **Description**: `truncate` (Tailwind's `text-overflow: ellipsis`) is used on device names, light labels, scene labels, station names, and room names across 7+ files. CLAUDE.md explicitly bans truncation: "Design must accommodate the full copy."
- **Impact**: Device names are the primary means of identification. "Bedroom Ceiling Li..." is ambiguous when names are similar. The Away User monitoring remotely gets even less context.
- **Fix**: Remove `truncate` from label elements. Allow text to wrap with `break-words` or `overflow-wrap: anywhere`. Adjust layout so label column has sufficient space.
- **Files**: `client/src/pages/DevicesPage.tsx`, `client/src/pages/LightsPage.tsx`, `client/src/pages/SceneEditorPage.tsx`, `client/src/pages/RoomDetailPage.tsx`, `client/src/components/ui/LightCard.tsx`, `client/src/components/room/RoomIntelligence.tsx`, `client/src/pages/SettingsPage.tsx`

### 2026-03-25 — Inconsistent empty-state patterns (centralised vs inline)
- **Severity**: low
- **Status**: open
- **Category**: ux-consistency
- **Description**: The centralised `<EmptyState>` component is used on some pages but `HomePage`, `RoomsPage`, and `LightsPage` use inline `<div>` patterns with different styling.
- **Fix**: Replace inline empty states with `<EmptyState>` component.
- **Files**: `client/src/pages/HomePage.tsx`, `client/src/pages/RoomsPage.tsx`, `client/src/pages/LightsPage.tsx`

### 2026-03-25 — ScenesPage "Not assigned to a room" accordion is non-closeable
- **Severity**: low
- **Status**: open
- **Category**: ux-consistency
- **Description**: The unassigned scenes accordion is hardcoded `open={true}` with `onToggle={() => {}}`. The toggle button appears interactive but does nothing. Screen readers announce `aria-expanded="true"` on a non-functional toggle.
- **Fix**: Either manage open state normally or replace with a non-interactive section heading.
- **Files**: `client/src/pages/ScenesPage.tsx`

### 2026-03-25 — Mode badge rendered twice on desktop (sidebar and header)
- **Severity**: low
- **Status**: open
- **Category**: ux-consistency
- **Description**: The system mode badge (e.g. "Evening") appears in both the sidebar and the header on desktop viewports.
- **Fix**: Hide the header instance on desktop with `md:hidden`.
- **Files**: `client/src/components/layout/AppLayout.tsx`

---

## UX: Performance

### 2026-03-25 — Energy rate input fires API mutation on every keystroke
- **Severity**: medium
- **Status**: open
- **Category**: ux-performance
- **Description**: The energy rate and currency symbol inputs call `mutation.mutate()` in `onChange`, firing an API call per character. Typing "0.30" produces 4 API calls with intermediate partial values persisted.
- **Fix**: Use `onBlur` instead of `onChange`, or debounce the mutation call.
- **Files**: `client/src/pages/SettingsPage.tsx`

### 2026-03-25 — Module-level socket singleton breaks HMR and leaks listeners
- **Severity**: low
- **Status**: open
- **Category**: ux-performance
- **Description**: `useSocket.ts` declares `let socket: Socket | null = null` at module scope. Vite HMR re-evaluates modules but doesn't reset module-level state, causing duplicate event listeners to accumulate in development.
- **Fix**: Create socket inside a `useRef` or React context provider. Or use `import.meta.hot?.dispose` for cleanup.
- **Files**: `client/src/hooks/useSocket.ts`

### 2026-03-25 — Client fetch wrapper has no timeout
- **Severity**: low
- **Status**: open
- **Category**: ux-performance
- **Description**: `fetchApi` uses native `fetch()` with no timeout. When the server is unresponsive (PM2 restart), requests hang indefinitely. The UI appears frozen.
- **Fix**: Wrap with `AbortController` and a 15-second timeout.
- **Files**: `client/src/lib/api.ts`

---

## Code Quality

### 2026-03-25 — Dimmer slider initialises at hardcoded 50% ignoring device state
- **Severity**: medium
- **Status**: open
- **Category**: code-quality
- **Description**: `DevicesPage.tsx` uses `useState(50)` for dimmer level. The actual current level from `device.hubDevice.attributes.level` is ignored. If the user clicks "Set Level" without moving the slider, the device is sent to 50%.
- **Fix**: Initialise with `useState(() => device.hubDevice?.attributes?.level ?? 50)`.
- **Files**: `client/src/pages/DevicesPage.tsx`

### 2026-03-25 — `LightsPage.tsx` is orphaned — no route exists
- **Severity**: low
- **Status**: open
- **Category**: code-quality
- **Description**: `LightsPage.tsx` is fully implemented but has no route in `App.tsx`. It is dead code that will drift out of sync.
- **Fix**: Either add a `/lights` route or delete the file.
- **Files**: `client/src/pages/LightsPage.tsx`, `client/src/App.tsx`

### 2026-03-25 — Dead code in kasa.ts PATCH config endpoint
- **Severity**: low
- **Status**: open
- **Category**: code-quality
- **Description**: `currentConfig` is parsed from `existing.attributes` but never used. The actual merge uses `existingConfig` from the `config` column.
- **Fix**: Remove the dead `currentConfig` block.
- **Files**: `server/src/routes/kasa.ts`

### 2026-03-25 — `SettingsPage.tsx` is 2000+ lines — should be decomposed
- **Severity**: low
- **Status**: open
- **Category**: code-quality
- **Description**: The settings page is a single file handling 8+ distinct sections. Each section is a standalone sub-component declared inline, making the file hard to navigate and test.
- **Fix**: Extract each section into its own file under `client/src/components/settings/`.
- **Files**: `client/src/pages/SettingsPage.tsx`

### 2026-03-25 — `chart.js` and `react-chartjs-2` duplicated in root package.json
- **Severity**: low
- **Status**: open
- **Category**: code-quality
- **Description**: These dependencies are listed in both root and client `package.json`. The root entries are unused — Vite bundles from `client/node_modules`.
- **Fix**: Remove from root `package.json`.
- **Files**: `package.json`

### 2026-03-25 — N+1 queries in GET /scenes via parseScene
- **Severity**: low
- **Status**: open
- **Category**: code-quality
- **Description**: `GET /scenes` fetches all scene rows then calls `parseScene()` on each, which executes 2 queries per scene (scene_rooms + scene_modes). With N scenes, this is 1+2N queries.
- **Fix**: Replace with two bulk queries and join in JavaScript.
- **Files**: `server/src/routes/scenes.ts`

### 2026-03-25 — Excessive Hubitat event logging to stdout
- **Severity**: low
- **Status**: open
- **Category**: code-quality
- **Description**: Every Hubitat webhook call logs the full JSON payload to `console.log`. Motion/illuminance events fire many times per minute, generating megabytes of stdout log data per day.
- **Fix**: Remove or gate behind a `DEBUG` environment variable. The `logs` table already persists events.
- **Files**: `server/src/index.ts`

---

# Previously Tracked Issues

## 2026-03-24 — Butler's Kitchen Globe light often fails to turn on
- **Severity**: medium
- **Status**: resolved (2026-03-24)
- **Resolution**: Added `retryFailedLights` helper (PR #19)

## 2026-03-24 — Kitchen strip lights had wrong colors after LIFX scene migration
- **Severity**: medium
- **Status**: resolved (2026-03-24)
- **Resolution**: Manually corrected strip colours via API

## 2026-03-23 — Direct URL access to SPA routes returns 404 in production
- **Severity**: medium
- **Status**: resolved (2026-03-25)
- **Resolution**: SPA catch-all route already existed in index.ts (confirmed during audit)

## 2026-03-23 — Room locks lost on server restart (in-memory only)
- **Severity**: critical
- **Status**: resolved (2026-03-23)
- **Resolution**: Persisted to `current_state` table (PR #16)

## 2026-03-23 — Sun mode scheduler overwrites Sleep Time mode
- **Severity**: high
- **Status**: resolved (2026-03-23)
- **Resolution**: Scheduler skips Sleep Time (PR #16)

## 2026-03-23 — LIFX lights ignore room exclusions during All Off / Nighttime
- **Severity**: medium
- **Status**: resolved (2026-03-25)
- **Resolution**: Replaced setState('all') with per-room light queries in both scene-executor.ts and system.ts (PR #30)

## 2026-03-23 — HubDevice type missing `attributes` field
- **Severity**: low
- **Status**: resolved (2026-03-23)
- **Resolution**: Added field to interface (PR #14)

## 2026-03-23 — Multiple pre-existing unused import/variable TS errors in client
- **Severity**: low
- **Status**: resolved (2026-03-23)
- **Resolution**: Removed all unused imports (PR #14)

## 2026-03-23 — XO-prefixed device names still in use
- **Severity**: low
- **Status**: open
- **Impact**: Cosmetic — the XO prefix no longer has functional meaning

## 2026-03-25 — Sleep mode blocks wake mode trigger, system stuck in Sleep
- **Severity**: critical
- **Status**: resolved (2026-03-25)
- **Resolution**: Sleep guard allows wake mode transitions (PR #28)

## 2026-03-22 — GitHub token lacks PR creation permissions
- **Severity**: low
- **Status**: resolved (2026-03-22)
- **Resolution**: Token updated
