# Known Issues

> Track bugs, tech debt, and problems discovered during sessions.
> Format: date discovered, description, severity, status (open/resolved/wontfix).

---

# Production Readiness Audit (2026-03-25)

**Status: 41 of 47 RESOLVED in PR #30 (2026-03-25) — 3 FAILED, 3 WARN (reviewed 2026-03-26)**

The following issues were discovered during a comprehensive technical and UX audit of the entire codebase. They are grouped by category and ordered by severity within each category. A post-merge review on 2026-03-26 verified each fix against the current code.

---

## Infrastructure & Deployment

### 2026-03-25 — No graceful shutdown handling (SIGTERM/SIGINT)
- **Severity**: high
- **Status**: resolved (PR #30)
- **Category**: process-management
- **Description**: The server registers no `SIGTERM` or `SIGINT` handlers. PM2 sends `SIGTERM` before killing a process. Without a handler, all background intervals (`historyCollector`, `kasaPoller`, `weatherIndicator`, `sunModeScheduler`, `timeTriggerScheduler`) continue running until force-killed. SQLite WAL is not flushed cleanly. Stop functions exist on several modules but are never called on shutdown.
- **Impact**: Likely root cause of PM2 restart instability. Each unclean exit risks SQLite WAL corruption on the Pi's SD card. Timer state is lost without notification.
- **Fix**: Add `process.on('SIGTERM/SIGINT')` handler in `server/src/index.ts` that calls all `stop*()` functions, closes Socket.io, closes the HTTP server, then `db.close()` before `process.exit(0)`.
- **Files**: `server/src/index.ts`

### 2026-03-25 — Running TypeScript via `tsx` in production
- **Severity**: high
- **Status**: resolved (PR #30)
- **Category**: deployment
- **Description**: `ecosystem.config.cjs` and `deploy-to-pi.sh` configure PM2 to run `tsx src/index.ts` — a dev tool for on-the-fly TypeScript transpilation. The server already has a `tsc` build step and a `node dist/index.js` start script, but neither is used by PM2.
- **Impact**: Higher memory usage on a memory-constrained Pi; slower startup; TypeScript type errors are silent in production; dev dependency in the production execution path.
- **Fix**: Change PM2 `script` to `dist/index.js`. Ensure `deploy-to-pi.sh` runs `npm run build --prefix server` before starting PM2.
- **Files**: `ecosystem.config.cjs`, `deploy-to-pi.sh`

### 2026-03-25 — Server build not run during deployment
- **Severity**: high
- **Status**: resolved (PR #30)
- **Category**: deployment
- **Description**: `deploy-to-pi.sh` builds the client (`npx vite build`) but never builds the server. Masked by the `tsx` issue above, but if PM2 is fixed to use compiled output, deployments would serve stale compiled code.
- **Impact**: Server code changes not reflected in production until manually rebuilt.
- **Fix**: Add `npm run build --prefix server` to the deploy script after the client build step.
- **Files**: `deploy-to-pi.sh`

### 2026-03-25 — Deploy script has no error handling or rollback
- **Severity**: medium
- **Status**: warn (partially fixed in PR #30 — `set -e` only in remote block, health check warns but doesn't exit non-zero)
- **Category**: deployment
- **Description**: No `set -e` in the outer shell script. If `scp` fails, SSH block runs with a missing or partial database. No pre-deploy backup. No post-deploy health check. `ecosystem.config.cjs` is overwritten every deploy, discarding manual Pi tweaks.
- **Impact**: Failed deploy can leave the app stopped with no automatic recovery.
- **Fix**: Add `set -e` at the top. Add SQLite backup step before copy. Add health check after `pm2 start`. Stop overwriting `ecosystem.config.cjs`.
- **Files**: `deploy-to-pi.sh`

### 2026-03-25 — PM2 config missing restart back-off and log path consistency
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: process-management
- **Description**: Neither committed nor deployed PM2 config sets `restart_delay` or `exp_backoff_restart_delay`. PM2 restarts a crashing process immediately in a tight loop. Committed config and deployed config differ on log paths.
- **Impact**: Crash loops burn CPU and generate log spam. Log location confusion.
- **Fix**: Add `exp_backoff_restart_delay: 1000` and `max_restarts: 10`. Unify committed and deployed configs.
- **Files**: `ecosystem.config.cjs`

### 2026-03-25 — Missing environment variables in `.env.example`
- **Severity**: high
- **Status**: resolved (PR #30)
- **Category**: deployment
- **Description**: `.env.example` documents only 6 of ~10 required variables. Missing: `OPENWEATHER_API`, `LATITUDE`, `LONGITUDE`, `KASA_SIDECAR_URL`. No startup validation — missing vars cause silent failures (broken weather, broken sun scheduling, `Bearer undefined` LIFX auth header).
- **Impact**: Fresh deployment silently broken across multiple features. No helpful error message on startup.
- **Fix**: Add all missing variables to `.env.example`. Add startup validation that checks required vars and throws a clear error if absent.
- **Files**: `server/.env.example`, `server/src/index.ts`

---

## Security

### 2026-03-25 — Hubitat webhook has no authentication and is publicly reachable
- **Severity**: high
- **Status**: open (rate limiting added in PR #30, but auth is optional — no-op if HUBITAT_WEBHOOK_SECRET not set; token still read from query param not header)
- **Category**: security
- **Description**: `POST /hubitat` accepts requests with no authentication, no rate limiting, and no IP allowlist. Via the Cloudflare tunnel, this endpoint is reachable from the public internet. Any actor who discovers the URL can send arbitrary motion/power/battery events, triggering scene changes and writing to the database.
- **Impact**: An attacker can trigger scene activations, fill the database with junk data, and stress the SD card with repeated writes.
- **Fix**: Add a shared secret header validation (e.g. `X-Hubitat-Token` checked against `process.env.HUBITAT_WEBHOOK_SECRET`). Add `express-rate-limit` on the `/hubitat` route. Reduce the global body limit from 10MB to 100KB.
- **Files**: `server/src/index.ts`

### 2026-03-25 — Hubitat webhook token read from URL query parameter
- **Severity**: low
- **Status**: resolved (2026-03-27 — outbound client corrected to use axios `params` instead of fake Authorization header; inbound webhook must use query param per Hubitat Maker API limitation)
- **Category**: security
- **Description**: The Hubitat Maker API only supports access tokens as URL query parameters — both for outbound API calls and inbound webhooks. There is no header-based auth option. PR #30 incorrectly replaced the query param with an `Authorization: Bearer` header that Hubitat silently ignores. Fixed to use axios `params: { access_token }` which correctly appends the token to URLs.
- **Impact**: Accepted limitation of the Hubitat Maker API. Query param token exposure is low risk on a home network.
- **Files**: `server/src/lib/hubitat-client.ts`

### 2026-03-25 — Preferences endpoint accepts arbitrary key names without allowlist
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: security
- **Description**: `PUT /preferences` accepts any `key` string and writes `pref_{key}` to `current_state`. No schema validation or allowlist. A client can write any `pref_*` key with any value, including extremely long strings.
- **Impact**: Any client can create or overwrite system preferences. No length limit enables database bloat.
- **Fix**: Validate `key` against an explicit allowlist of valid preference keys. Limit `value` length.
- **Files**: `server/src/routes/system.ts`

### 2026-03-25 — Internal error messages exposed in 500 responses
- **Severity**: low
- **Status**: open (mostly fixed in PR #30, but 3 catch blocks still leak: kasa.ts:104, kasa.ts:233, lifx.ts:268)
- **Category**: security
- **Description**: All catch blocks return `err.message` directly to the client. Raw SQLite errors, file paths, and library errors are sent in API responses.
- **Impact**: Internal DB schema and file structure revealed to anyone with network access.
- **Fix**: Log full error server-side; return generic "Internal server error" to clients in production.
- **Files**: All route files

### 2026-03-25 — Global request body limit too permissive (10MB)
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: security
- **Description**: `express.json({ limit: '10mb' })` is applied globally. No legitimate request exceeds a few KB. The Hubitat webhook receives payloads of a few hundred bytes.
- **Impact**: Malicious or buggy client can send 10MB JSON bodies, causing excessive memory allocation and potential OOM on the Pi.
- **Fix**: Reduce global limit to `100kb`. Apply higher limit only to specific routes that need it.
- **Files**: `server/src/index.ts`

---

## Data Integrity

### 2026-03-25 — Unbounded database growth (device_history, logs, room_activity)
- **Severity**: high
- **Status**: resolved (PR #30 — logs auto-pruned at 30 days; device_history relies on manual DELETE /history)
- **Category**: data-integrity
- **Description**: Three tables grow without any automated pruning. `device_history` gains ~1,300 rows/day (~470k/year). `logs` gains thousands of rows/day from motion/illuminance events. `room_activity` written on every motion event with no TTL. Database already 6.7MB after two days.
- **Impact**: Will slow SQLite queries, consume SD card space, and increase backup times. Manual deletion exists but requires user intervention.
- **Fix**: Add an automated cleanup job in `history-collector.ts` that runs daily and deletes rows older than a configurable retention period (e.g. 90 days for history, 30 days for logs). Add `FAIRY_HISTORY_RETENTION_DAYS` to `.env.example`.
- **Files**: `server/src/lib/history-collector.ts`, `server/src/db/index.ts`

### 2026-03-25 — Scene chaining has no cycle detection
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: data-integrity
- **Description**: The `fairy_scene` command type calls `activateScene()` recursively. No guard against circular references (Scene A -> Scene B -> Scene A). This would create infinite recursion, exhausting the call stack and crashing the Node process.
- **Impact**: A misconfigured scene chain crashes the server.
- **Fix**: Pass a `Set<string>` of visited scene names through the call stack and throw if a cycle is detected.
- **Files**: `server/src/lib/scene-executor.ts`

### 2026-03-25 — Room delete is not atomic (two independent queries)
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: data-integrity
- **Description**: Deleting a room executes `DELETE FROM light_rooms` then `DELETE FROM rooms` as separate `run()` calls, not wrapped in a transaction. `device_rooms` rows are not deleted either (no FK cascade).
- **Impact**: Process crash between statements leaves orphaned records.
- **Fix**: Wrap in `db.transaction()`. Add `device_rooms` cleanup.
- **Files**: `server/src/routes/rooms.ts`

### 2026-03-25 — Light room assignment replace is not atomic
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: data-integrity
- **Description**: `POST /lights/rooms` deletes all existing light-room assignments then inserts new ones. Delete and N inserts are individual `run()` calls outside a transaction.
- **Impact**: Process crash mid-insert leaves a room with partial or no light assignments.
- **Fix**: Wrap delete + insert loop in `db.transaction()`.
- **Files**: `server/src/routes/lights.ts`

### 2026-03-25 — `mode_triggers` table created before `modes` table in schema
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: data-integrity
- **Description**: `mode_triggers` has a FK referencing `modes(name)` but `modes` CREATE TABLE comes after. Currently masked by SQLite's lenient FK enforcement on CREATE, but semantically incorrect.
- **Fix**: Move `modes` table definition before `mode_triggers` in `db.exec()`.
- **Files**: `server/src/db/index.ts`

### 2026-03-25 — No database migration strategy
- **Severity**: medium
- **Status**: wontfix (unnecessary for single-user project; dead migration code to be cleaned up instead)
- **Category**: data-integrity
- **Description**: All tables use `CREATE TABLE IF NOT EXISTS`. No migration runner, no schema version tracking. Adding a column requires manually altering the table on the Pi or resetting the database.
- **Impact**: Any schema change requires manual intervention or data loss.
- **Fix**: Add a simple migration system (e.g. `schema_migrations` table with numbered migration functions).
- **Files**: `server/src/db/index.ts`

---

## Reliability

### 2026-03-25 — Weather indicator uses hardcoded mode names instead of lock state
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: reliability
- **Description**: `weather-indicator.ts` checks mode names `'Night'` and `'Guest Night'` hardcoded. The motion handler uses `isRoomLocked()` which checks persisted lock state regardless of mode name. If the user renames these modes, the weather indicator continues activating during night conditions.
- **Fix**: Use `motionHandler.isRoomLocked()` or `isIndicatorLightBlocked()` instead of comparing mode name strings.
- **Files**: `server/src/lib/weather-indicator.ts`

### 2026-03-25 — VACUUM blocks the event loop on data deletion
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: reliability
- **Description**: `DELETE /history` calls `db.exec('VACUUM')` synchronously. On a Pi with a large database, VACUUM can take several seconds, blocking all other requests.
- **Impact**: Server unresponsive during VACUUM.
- **Fix**: Either skip VACUUM (WAL checkpoint is sufficient), or accept it as an admin-only rare operation and document the latency.
- **Files**: `server/src/routes/dashboard.ts`

### 2026-03-25 — DELETE /history has no audit log or confirmation guard
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: reliability
- **Description**: `DELETE /history` accepts `{ all: true }` and deletes the entire `device_history` table. No auth, no confirmation token, no audit log entry.
- **Impact**: Accidental or malicious full data loss.
- **Fix**: Add audit log entry. Consider requiring a confirmation string in the request body.
- **Files**: `server/src/routes/dashboard.ts`

### 2026-03-25 — Initial setTimeout in pollers not clearable on fast shutdown
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: reliability
- **Description**: `startKasaPoller` and `startHistoryCollector` use a `setTimeout` for initial delay. The return value is not stored, so calling `stop*()` within the delay window doesn't prevent the interval from being established.
- **Fix**: Store the `setTimeout` handle and clear it in `stop*()`.
- **Files**: `server/src/lib/kasa-poller.ts`, `server/src/lib/history-collector.ts`

---

## API Design

### 2026-03-25 — `GET /hubitat/devices/sync` uses GET for a state-mutating operation
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: api-design
- **Description**: Sync endpoint modifies the database (upserts and deletes hub devices) but uses HTTP GET. Proxies may cache GET responses.
- **Fix**: Change to `POST /api/hubitat/devices/sync`.
- **Files**: `server/src/routes/hubitat.ts`

### 2026-03-25 — `POST /lifx/test` returns 200 on error
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: api-design
- **Description**: Returns `{ success: false }` with a 200 status code when LIFX is unreachable. Clients checking HTTP status will think it succeeded.
- **Fix**: Return `res.status(503).json(...)` when LIFX is unreachable.
- **Files**: `server/src/routes/lifx.ts`

### 2026-03-25 — `POST /hubitat/device-rooms` has no Zod schema
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: api-design
- **Description**: Uses manual if-check instead of Zod validation. `device_type` is not validated against the allowed enum. Invalid values cause a raw SQLite error surfaced as a 500.
- **Fix**: Replace with a Zod schema that validates all fields and `device_type` against the enum.
- **Files**: `server/src/routes/hubitat.ts`

---

## UX: Accessibility

### 2026-03-25 — Notification panel does not return focus to bell button on close
- **Severity**: high
- **Status**: resolved (PR #30)
- **Category**: accessibility
- **Description**: When the notification panel opens, focus moves to the panel. On close (Escape or outside click), focus is not returned to the `NotificationBell` button. WCAG 2.4.3 requires focus to be managed logically when popups close.
- **Impact**: Keyboard and screen reader users lose their place in the page.
- **Fix**: Pass `returnFocusRef` from `NotificationBell` to `NotificationPanel` and call `buttonRef.current?.focus()` on close.
- **Files**: `client/src/components/notifications/NotificationBell.tsx`, `client/src/components/notifications/NotificationPanel.tsx`

### 2026-03-25 — Scene icons rendered as raw emoji without aria-hidden
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: accessibility
- **Description**: Scene icons are emoji strings rendered directly into the DOM without `aria-hidden="true"`. Screen readers announce them (e.g. "moon symbol Nighttime"), doubling the spoken text. `LightDetailPage` correctly uses `aria-hidden` but `HomePage`, `WatchPage`, `ScenesPage`, `RoomDetailPage` do not.
- **Impact**: Screen reader users hear redundant emoji names. Inconsistent emoji rendering across platforms.
- **Fix**: Add `aria-hidden="true"` to all emoji `<span>` elements. Long-term: migrate to named icon system from Lucide.
- **Files**: `client/src/pages/HomePage.tsx`, `client/src/pages/WatchPage.tsx`, `client/src/pages/ScenesPage.tsx`, `client/src/pages/RoomDetailPage.tsx`

### 2026-03-25 — Walk-time stepper buttons below 44px touch target
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: accessibility
- **Description**: MTA walk time +/- buttons are `h-8 w-8` (32x32px). WCAG 2.2 and project standards require 44x44px minimum for touch targets.
- **Impact**: Hard to tap on mobile, especially for the Commuter persona setting up subway stops.
- **Fix**: Change to `min-h-[44px] min-w-[44px]`.
- **Files**: `client/src/pages/SettingsPage.tsx`

### 2026-03-25 — LogsPage expand button missing accessible label
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: accessibility
- **Description**: Expand/collapse chevron button in `LogEntry` has no `aria-label`. When disabled (no debug data), it is invisible but still in the tab order.
- **Fix**: Add `aria-label="Expand/Collapse log details"`. Add `aria-hidden` and `tabIndex={-1}` when disabled.
- **Files**: `client/src/pages/LogsPage.tsx`

### 2026-03-25 — `div role="button"` used instead of native button in SceneEditorPage
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: accessibility
- **Description**: `LightEditorCard` header uses `<div role="button">` instead of `<button>`. Custom keyboard handler only handles Enter and Space but misses form submission prevention.
- **Fix**: Replace with `<button type="button">`.
- **Files**: `client/src/pages/SceneEditorPage.tsx`

### 2026-03-25 — HomeSummaryStrip has nested interactive elements
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: accessibility
- **Description**: `Pill` component wraps a `<section>` with a click handler containing a `<button>` with the same handler. The outer `<section>` is not focusable, making it mouse-only.
- **Fix**: Remove click from `<section>`, make `<button>` fill the card area, or replace entire `Pill` with a `<button>`.
- **Files**: `client/src/components/dashboard/HomeSummaryStrip.tsx`

---

## UX: State Handling

### 2026-03-25 — Missing error states on multiple key pages
- **Severity**: high
- **Status**: resolved (PR #30)
- **Category**: ux-state
- **Description**: `RoomsPage`, `ScenesPage`, `HomePage`, `LightsPage`, and `WatchPage` have no `isError` handling on their `useQuery` calls. When the API is unreachable (network loss, server restart, Cloudflare tunnel outage), these pages silently show empty states (e.g. "No rooms yet") instead of telling the user something is wrong.
- **Impact**: Critical for the Away User who needs to know if data is stale vs the API being down. Misleading empty state copy ("Tap 'Add Room' to create your first room") is actively wrong in error conditions. The Commuter seeing a blank WatchPage with no feedback is the worst outcome for that persona.
- **Fix**: Destructure `isError` from each `useQuery` and render an inline error state with retry button (similar to `DashboardPage`'s `DashboardError` component).
- **Files**: `client/src/pages/RoomsPage.tsx`, `client/src/pages/ScenesPage.tsx`, `client/src/pages/HomePage.tsx`, `client/src/pages/LightsPage.tsx`, `client/src/pages/WatchPage.tsx`

### 2026-03-25 — WatchPage has no loading or error states at all
- **Severity**: high
- **Status**: resolved (PR #30)
- **Category**: ux-state
- **Description**: The Commuter's primary interface (`/watch`) has no loading indicator, no error message, no skeleton. A blank screen with no feedback is the worst possible outcome for a persona using the app for 2-3 seconds while rushing.
- **Fix**: Add skeleton for loading state and minimal inline error with retry for error state.
- **Files**: `client/src/pages/WatchPage.tsx`

### 2026-03-25 — Dashboard error recovery uses full page reload instead of targeted refetch
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: ux-state
- **Description**: `DashboardPage`'s retry button calls `window.location.reload()`, resetting all app state (open accordions, filters, scroll position).
- **Fix**: Replace with `queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })`.
- **Files**: `client/src/pages/DashboardPage.tsx`

---

## UX: Microcopy & Consistency

### 2026-03-25 — `truncate` used on user-visible labels across the app (banned by standards)
- **Severity**: high
- **Status**: resolved (PR #30)
- **Category**: ux-microcopy
- **Description**: `truncate` (Tailwind's `text-overflow: ellipsis`) is used on device names, light labels, scene labels, station names, and room names across 7+ files. CLAUDE.md explicitly bans truncation: "Design must accommodate the full copy."
- **Impact**: Device names are the primary means of identification. "Bedroom Ceiling Li..." is ambiguous when names are similar. The Away User monitoring remotely gets even less context.
- **Fix**: Remove `truncate` from label elements. Allow text to wrap with `break-words` or `overflow-wrap: anywhere`. Adjust layout so label column has sufficient space.
- **Files**: `client/src/pages/DevicesPage.tsx`, `client/src/pages/LightsPage.tsx`, `client/src/pages/SceneEditorPage.tsx`, `client/src/pages/RoomDetailPage.tsx`, `client/src/components/ui/LightCard.tsx`, `client/src/components/room/RoomIntelligence.tsx`, `client/src/pages/SettingsPage.tsx`

### 2026-03-25 — Inconsistent empty-state patterns (centralised vs inline)
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: ux-consistency
- **Description**: The centralised `<EmptyState>` component is used on some pages but `HomePage`, `RoomsPage`, and `LightsPage` use inline `<div>` patterns with different styling.
- **Fix**: Replace inline empty states with `<EmptyState>` component.
- **Files**: `client/src/pages/HomePage.tsx`, `client/src/pages/RoomsPage.tsx`, `client/src/pages/LightsPage.tsx`

### 2026-03-25 — ScenesPage "Not assigned to a room" accordion is non-closeable
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: ux-consistency
- **Description**: The unassigned scenes accordion is hardcoded `open={true}` with `onToggle={() => {}}`. The toggle button appears interactive but does nothing. Screen readers announce `aria-expanded="true"` on a non-functional toggle.
- **Fix**: Either manage open state normally or replace with a non-interactive section heading.
- **Files**: `client/src/pages/ScenesPage.tsx`

### 2026-03-25 — Mode badge rendered twice on desktop (sidebar and header)
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: ux-consistency
- **Description**: The system mode badge (e.g. "Evening") appears in both the sidebar and the header on desktop viewports.
- **Fix**: Hide the header instance on desktop with `md:hidden`.
- **Files**: `client/src/components/layout/AppLayout.tsx`

---

## UX: Performance

### 2026-03-25 — Energy rate input fires API mutation on every keystroke
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: ux-performance
- **Description**: The energy rate and currency symbol inputs call `mutation.mutate()` in `onChange`, firing an API call per character. Typing "0.30" produces 4 API calls with intermediate partial values persisted.
- **Fix**: Use `onBlur` instead of `onChange`, or debounce the mutation call.
- **Files**: `client/src/pages/SettingsPage.tsx`

### 2026-03-25 — Module-level socket singleton breaks HMR and leaks listeners
- **Severity**: low
- **Status**: warn (dev-only issue, no production impact; needs import.meta.hot.dispose hook)
- **Category**: ux-performance
- **Description**: `useSocket.ts` declares `let socket: Socket | null = null` at module scope. Vite HMR re-evaluates modules but doesn't reset module-level state, causing duplicate event listeners to accumulate in development.
- **Fix**: Create socket inside a `useRef` or React context provider. Or use `import.meta.hot?.dispose` for cleanup.
- **Files**: `client/src/hooks/useSocket.ts`

### 2026-03-25 — Client fetch wrapper has no timeout
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: ux-performance
- **Description**: `fetchApi` uses native `fetch()` with no timeout. When the server is unresponsive (PM2 restart), requests hang indefinitely. The UI appears frozen.
- **Fix**: Wrap with `AbortController` and a 15-second timeout.
- **Files**: `client/src/lib/api.ts`

---

## Code Quality

### 2026-03-25 — Dimmer slider initialises at hardcoded 50% ignoring device state
- **Severity**: medium
- **Status**: resolved (PR #30)
- **Category**: code-quality
- **Description**: `DevicesPage.tsx` uses `useState(50)` for dimmer level. The actual current level from `device.hubDevice.attributes.level` is ignored. If the user clicks "Set Level" without moving the slider, the device is sent to 50%.
- **Fix**: Initialise with `useState(() => device.hubDevice?.attributes?.level ?? 50)`.
- **Files**: `client/src/pages/DevicesPage.tsx`

### 2026-03-25 — `LightsPage.tsx` is orphaned — no route exists
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: code-quality
- **Description**: `LightsPage.tsx` is fully implemented but has no route in `App.tsx`. It is dead code that will drift out of sync.
- **Fix**: Either add a `/lights` route or delete the file.
- **Files**: `client/src/pages/LightsPage.tsx`, `client/src/App.tsx`

### 2026-03-25 — Dead code in kasa.ts PATCH config endpoint
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: code-quality
- **Description**: `currentConfig` is parsed from `existing.attributes` but never used. The actual merge uses `existingConfig` from the `config` column.
- **Fix**: Remove the dead `currentConfig` block.
- **Files**: `server/src/routes/kasa.ts`

### 2026-03-25 — `SettingsPage.tsx` is 2000+ lines — should be decomposed
- **Severity**: low
- **Status**: warn (ModesList/ModeDetail extracted, but file grew to 2173 lines; needs further decomposition)
- **Category**: code-quality
- **Description**: The settings page is a single file handling 8+ distinct sections. Each section is a standalone sub-component declared inline, making the file hard to navigate and test.
- **Fix**: Extract each section into its own file under `client/src/components/settings/`.
- **Files**: `client/src/pages/SettingsPage.tsx`

### 2026-03-25 — `chart.js` and `react-chartjs-2` duplicated in root package.json
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: code-quality
- **Description**: These dependencies are listed in both root and client `package.json`. The root entries are unused — Vite bundles from `client/node_modules`.
- **Fix**: Remove from root `package.json`.
- **Files**: `package.json`

### 2026-03-25 — N+1 queries in GET /scenes via parseScene
- **Severity**: low
- **Status**: resolved (PR #30)
- **Category**: code-quality
- **Description**: `GET /scenes` fetches all scene rows then calls `parseScene()` on each, which executes 2 queries per scene (scene_rooms + scene_modes). With N scenes, this is 1+2N queries.
- **Fix**: Replace with two bulk queries and join in JavaScript.
- **Files**: `server/src/routes/scenes.ts`

### 2026-03-25 — Excessive Hubitat event logging to stdout
- **Severity**: low
- **Status**: resolved (PR #30)
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

## 2026-03-26 — Allow users to select and manage icons for modes
- **Severity**: enhancement
- **Status**: resolved (2026-03-27, PR #50)
- **Category**: ux-enhancement
- **Priority**: low
- **Description**: The database now has an `icon` column on the `modes` table with sensible defaults (sunrise, sun, sunset, moon-star, moon, bed). There is currently no UI for users to change these. Add a Lucide icon picker on the mode creation/edit page so users can choose from a curated set of icons. The selected icon should appear in: mode pills in auto-play rule forms, mode badges throughout the app, and the mode scheduler/settings page.
- **Files**: `client/src/pages/SettingsPage.tsx` (or extracted mode settings component), `server/src/routes/modes.ts`

## 2026-03-26 — Allow users to select icons or upload images for rooms
- **Severity**: enhancement
- **Status**: resolved (2026-03-27, PR #50)
- **Category**: ux-enhancement
- **Priority**: low
- **Description**: The database now has an `icon` column on the `rooms` table (currently NULL for all rooms). There is currently no UI for users to set or change room icons. Add a Lucide icon picker (and optionally a small image upload) on the room creation/edit page. The selected icon should appear in: room cards on the home page, room selector dropdowns, and room detail page headers.
- **Files**: `client/src/pages/RoomsPage.tsx`, `client/src/pages/RoomDetailPage.tsx`, `client/src/pages/HomePage.tsx`, `server/src/routes/rooms.ts`

## 2026-03-27 — Add icons to native select dropdowns for rooms and modes
- **Severity**: enhancement
- **Status**: planned
- **Category**: ux-enhancement
- **Priority**: low
- **Description**: Several room/mode selectors use native HTML `<select>` elements which cannot render icons in `<option>` tags. These include: LightDetailPage room dropdown, SonosSetupPage room dropdown, MusicSection room dropdown. A future enhancement could replace these with custom accessible dropdown components (e.g., Radix Select) to support icon rendering. Low priority — the text-only selectors work fine functionally.
- **Files**: `client/src/pages/LightDetailPage.tsx`, `client/src/pages/SonosSetupPage.tsx`, `client/src/components/settings/MusicSection.tsx`

## 2026-03-27 — Kasa parent strip all-off bypasses per-outlet exclusions
- **Severity**: high
- **Status**: resolved (2026-03-27, PR #63)
- **Category**: reliability
- **Description**: `runAllOff()` sent 'off' to parent Kasa strips (kasa_strip type), which kills ALL outlets via python-kasa's `SmartStrip.turn_off()` — bypassing per-outlet `exclude_from_all_off` flags. Sonos Bedroom and WFH WiFi had exclusions set but were still turned off by Nighttime/All Off.
- **Fix**: Skip parent strips in `runAllOff()`, only control child outlets individually.
- **Files**: `server/src/routes/system.ts`

## 2026-03-27 — WFH scene used stale Hubitat device IDs (404 errors)
- **Severity**: high
- **Status**: resolved (2026-03-27, PR #63)
- **Category**: data-integrity
- **Description**: WFH scene commands still referenced `hubitat_device` type with old Hubitat device IDs (1288, 1292, etc.) that no longer exist since migration to Kasa sidecar. Scene activation produced 404 errors and failed to turn on any outlets.
- **Fix**: Idempotent DB migration replaces commands with `kasa_device` type using correct MAC-based outlet IDs.
- **Files**: `server/src/db/index.ts`

## 2026-03-27 — Bedroom motion sensor intermittently unassigned
- **Severity**: medium
- **Status**: monitoring
- **Category**: reliability
- **Description**: Bedroom motion sensor was "not assigned to any room" from 05:51 to 13:21 despite the `device_rooms` row existing. Correlated with 55+ server restarts from agent build activity. Likely WAL/locking issue from concurrent database access. Resolved itself once restarts settled. Monitor for recurrence.
- **Files**: `server/src/lib/motion-handler.ts`, `server/src/db/index.ts`

## 2026-03-27 — Separate Fairy and Twinkly devices from hub_devices
- **Severity**: enhancement
- **Status**: planned
- **Category**: architecture
- **Priority**: medium
- **Description**: Fairy (ESP8266) and Twinkly devices are currently stored in `hub_devices` and recorded as type `'hub'` in device_health, but they are completely independent from Hubitat. They should have their own tables and device types. Scope includes:
  - **Fairy devices**: Dedicated `fairy_devices` table, new `'fairy'` device type in device_health, and a management UI for users to add/edit/remove Fairy devices (currently hardcoded).
  - **Twinkly lights**: Dedicated `twinkly_devices` table, new `'twinkly'` device type in device_health, and expanded control UI. The Twinkly API offers more capabilities than currently exposed — research the full API surface during planning phase.
  - Update scene-executor, device-health-service, deactivation API, and all frontend references to handle the new types.
  - Migrate existing fairy/twinkly rows out of hub_devices.
- **Files**: `server/src/db/index.ts`, `server/src/lib/scene-executor.ts`, `server/src/lib/device-health-service.ts`, `server/src/lib/fairy-device-client.ts`, `server/src/lib/twinkly-client.ts`, `server/src/routes/system.ts`, `client/src/pages/DevicesPage.tsx`, `client/src/pages/DeviceDetailPage.tsx`

---

# Comprehensive Product Audit (2026-03-28)

**Scope**: Full product review across 5 dimensions — backend technical, frontend technical, UX/accessibility, logging/observability, and feature documentation. Conducted by 5 parallel review agents reading the entire codebase.

---

## Backend: Critical

### 2026-03-28 — `active` column missing from schema DDL — breaks fresh deployments
- **Severity**: critical
- **Status**: resolved (PR #76)
- **Category**: data-integrity
- **Description**: The `active` column is queried and updated in `device-health-service.ts`, `scene-executor.ts`, and `system.ts`, but is never added via `CREATE TABLE` or `ALTER TABLE` in `db/index.ts`. On a fresh database (new Pi, wipe-and-restore), all three tables (`hub_devices`, `kasa_devices`, `light_rooms`) are created without `active`. Every call to `isDeviceActive()`, `deactivateDevice()`, or `reactivateDevice()` fails. Scene execution skips the `active = 1` filter, returning no lights for `all_off`. The `all_off` command in scenes silently does nothing on fresh installs.
- **Fix**: Add `active INTEGER DEFAULT 1` to all three `CREATE TABLE` statements. Add `ALTER TABLE ... ADD COLUMN active INTEGER DEFAULT 1` guards to `initDb()`.
- **Files**: `server/src/db/index.ts`, `server/src/lib/scene-executor.ts`, `server/src/lib/device-health-service.ts`

---

## Backend: High

### 2026-03-28 — Hubitat device sync has N+1 queries with no concurrency control
- **Severity**: high
- **Status**: resolved (PR #76)
- **Category**: reliability
- **Description**: `POST /devices/sync` calls `hubitatClient.getDevice(dev.id)` sequentially for every device — one HTTP request per device with 10s timeout. For 20+ devices this takes 20+ serial requests. No mutex prevents concurrent syncs (double-click). Both would run in parallel, conflicting on upsert.
- **Fix**: Add a `syncInProgress` mutex to reject concurrent syncs with 409. Consider parallelising with concurrency limiter.
- **Files**: `server/src/routes/hubitat.ts`

### 2026-03-28 — Deploy script overwrites production database unconditionally
- **Severity**: high
- **Status**: resolved (PR #76)
- **Category**: deployment
- **Description**: `deploy-to-pi.sh` copies the local database over the Pi's production database on every deploy. Only one `.pre-deploy-backup` is kept (overwritten each time). Accidental deploy from a stale/empty database permanently destroys all production data.
- **Fix**: Timestamp backup files. Make DB copy opt-in with `--include-db` flag. Keep last N backups.
- **Files**: `deploy-to-pi.sh`

---

## Backend: Medium

### 2026-03-28 — Memory leak: `webhookHits` rate-limit map grows unboundedly
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: reliability
- **Description**: `webhookHits` is a `Map<string, number[]>` that never evicts empty entries. Every unique IP accumulates a permanent empty array. On a long-running Pi process with IP changes, this is a slow memory drain.
- **Fix**: Delete map key when filtered array is empty. Or add periodic sweep.
- **Files**: `server/src/index.ts`

### 2026-03-28 — Motion handler room timers not cleaned up on shutdown
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: reliability
- **Description**: `MotionHandler.roomTimers` holds `NodeJS.Timeout` objects that are never cleared on SIGTERM. Node holds the process open past the 5s forced exit deadline since timers are not `.unref()`'d.
- **Fix**: Add `shutdown()` method to `MotionHandler` that clears all room timers. Call from shutdown handler in `index.ts`.
- **Files**: `server/src/lib/motion-handler.ts`, `server/src/index.ts`

### 2026-03-28 — `dashboard.ts` JSON.parse in device context has no error handling
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: reliability
- **Description**: `JSON.parse(s.commands)` in `GET /api/dashboard/device/:id/context` is called inside `.filter()` with no try/catch. Corrupt `commands` JSON crashes the entire request with a 500.
- **Fix**: Wrap in `try { ... } catch { return false }`.
- **Files**: `server/src/routes/dashboard.ts`

### 2026-03-28 — LIFX `withRetry` only retries once on 429
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: reliability
- **Description**: The retry wrapper catches a 429, waits for reset, then calls once more. If the second attempt also gets 429 (clock skew, stale reset timestamp), the error propagates and scene-executor silently swallows it — lights don't change state.
- **Fix**: Add a second retry cycle or minimum wait floor (2s).
- **Files**: `server/src/lib/lifx-client.ts`

---

## Backend: Low

### 2026-03-28 — Kasa sidecar has no PM2 startup-order guarantee
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: deployment
- **Description**: PM2 starts Node and Python processes in parallel. Cold Pi boot where Python venv takes >5s means first Kasa poll fails silently.
- **Files**: `ecosystem.config.cjs`

### 2026-03-28 — Sonos zone polling timer not cleared on concurrent shutdown
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: reliability
- **Description**: Edge case where `poll()` completes and reschedules after `shutdown()` runs.
- **Fix**: Add `shuttingDown` flag.
- **Files**: `server/src/lib/sonos-manager.ts`

### 2026-03-28 — History collector prune blocks event loop at startup
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: reliability
- **Description**: `pruneOldLogs()` runs synchronously via better-sqlite3 during startup. Large log tables block all requests.
- **Fix**: Defer with `setTimeout(..., 60_000)`.
- **Files**: `server/src/lib/history-collector.ts`

### 2026-03-28 — `dashboard.ts` history endpoint interpolates cutoff into SQL
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: code-quality
- **Description**: `cutoff` is trusted (from whitelisted switch), but the pattern of string interpolation into SQL is a maintenance risk.
- **Fix**: Refactor to parameterised values or add safety comment.
- **Files**: `server/src/routes/dashboard.ts`

---

## Frontend: High

### 2026-03-28 — DevicesPage creates redundant socket connection on every filter change
- **Severity**: high
- **Status**: resolved (PR #76)
- **Category**: performance
- **Description**: `socketIo(url, ...)` is called directly inside a `useEffect`, creating a new TCP connection alongside the global singleton from `useSocket.ts`. Every tab change between 'all' and 'sonos' creates and destroys a connection.
- **Fix**: Reuse `getSocket()` singleton. Register/deregister event handlers with `.on()`/`.off()` only.
- **Files**: `client/src/pages/DevicesPage.tsx`

### 2026-03-28 — RoomDetailPage creates redundant socket connection per room visit
- **Severity**: high
- **Status**: resolved (PR #76)
- **Category**: performance
- **Description**: Same anti-pattern as DevicesPage — `socketIo()` called directly in useEffect, creating duplicate TCP connections.
- **Fix**: Use shared `getSocket()` singleton.
- **Files**: `client/src/pages/RoomDetailPage.tsx`

---

## Frontend: Medium

### 2026-03-28 — SonosDetailPage debounce timers leak on unmount
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: reliability
- **Description**: `liveVolumeTimer` and `volumeSaveTimer` useRef timeouts are never cleared on unmount. Navigating away while debounce is pending fires stale mutation.
- **Fix**: Add cleanup useEffect that clears both timers.
- **Files**: `client/src/pages/SonosDetailPage.tsx`

### 2026-03-28 — Suppressed ESLint rule hides stale-closure risk in SceneEditorPage
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: code-quality
- **Description**: `deactivatedCount` useMemo has `eslint-disable-next-line react-hooks/exhaustive-deps` suppressing a real dependency warning. Three inline arrow functions close over `deactivatedSet` but aren't listed as deps.
- **Fix**: Inline the `.has()` checks directly inside the useMemo. Remove suppression comment.
- **Files**: `client/src/pages/SceneEditorPage.tsx`

### 2026-03-28 — EnvironmentCard reads temp_unit from localStorage, bypassing preferences query
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: correctness
- **Description**: `EnvironmentCard` reads temperature unit from `localStorage` via `getTempUnit()` instead of the `['system', 'preferences']` TanStack Query. Changing the unit in Settings won't update EnvironmentCard until page reload.
- **Fix**: Use `useQuery` for preferences, matching the pattern in WeatherCard.
- **Files**: `client/src/components/dashboard/EnvironmentCard.tsx`

### 2026-03-28 — Scene icon field accepts emoji (violates UX standards)
- **Severity**: medium
- **Status**: ignore - this can be reviewed in the future.
- **Category**: ux-policy
- **Description**: Scene icon input is labeled "Scene icon (emoji or text)" with `maxLength={4}`, inviting emoji input. Emoji is rendered across HomePage, ScenesPage, WatchPage, RoomDetailPage. CLAUDE.md Section 5 bans emoji in UI. The rest of the app uses LucideIcon exclusively.
- **Fix**: Replace freeform text field with `IconPicker` component. Migrate existing emoji values to Lucide icon names with fallback default.
- **Files**: `client/src/pages/SceneEditorPage.tsx`, all pages rendering scene icons

---

## Frontend: Low

### 2026-03-28 — Night status query not invalidated on socket mode change
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: correctness
- **Description**: `['system', 'night-status']` is not invalidated by the socket `mode:change` handler. Up to 10s delay before night banner appears/disappears.
- **Fix**: Add invalidation in `useSocket.ts` `handleModeChange`.
- **Files**: `client/src/hooks/useSocket.ts`

### 2026-03-28 — Chart.register called at module level in 3 separate components
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: code-quality
- **Description**: Chart.js plugins registered redundantly in `TimeSeriesChart`, `ActivityCard`, and `EnvironmentCard`. Benign but wasteful.
- **Fix**: Centralise into a single `chartSetup.ts` module.
- **Files**: `client/src/components/dashboard/TimeSeriesChart.tsx`, `ActivityCard.tsx`, `EnvironmentCard.tsx`

### 2026-03-28 — DeviceTrendChart uses mutable label as cache key
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: code-quality
- **Description**: TanStack Query key uses `deviceLabel` (human-readable name) instead of stable device ID. Device rename orphans cache.
- **Files**: `client/src/components/dashboard/EnergyCard.tsx`

---

## UX / Accessibility: High

### 2026-03-28 — OptionToggle switch in SceneEditor has no accessible label
- **Severity**: high
- **Status**: resolved (PR #76)
- **Category**: accessibility
- **Description**: `<Switch.Root>` inside `OptionToggle` has no `id`, `aria-label`, or `aria-labelledby`. Screen reader users cannot determine what the toggle controls.
- **Fix**: Add `aria-label={label}` to Switch.Root, or link with `id`/`htmlFor`.
- **Files**: `client/src/pages/SceneEditorPage.tsx`

---

## UX / Accessibility: Medium

### 2026-03-28 — `truncate` on MTA accordion summary text
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: ux-microcopy
- **Description**: MTA accordion header uses `className="truncate"` on the train arrival summary. Violates "no truncation" standard. Long station names get clipped.
- **Fix**: Remove `truncate`. Allow text to wrap.
- **Files**: `client/src/pages/HomePage.tsx`

### 2026-03-28 — Connection status icons use `title` only — not keyboard/SR accessible
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: accessibility
- **Description**: Wi-Fi icons in LightsPage/LightCard use `<span title="Connected">` with no `aria-label`. Title is hover-only.
- **Fix**: Add `aria-label` to the icon or add visually-hidden span.
- **Files**: `client/src/pages/LightsPage.tsx`, `client/src/components/ui/LightCard.tsx`

### 2026-03-28 — Expand/Collapse buttons have generic labels (no device context)
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: accessibility
- **Description**: Toggle buttons use `aria-label="Expand"/"Collapse"` without device name context. SR user hears "Expand" without knowing what.
- **Fix**: Include device name in label: `aria-label={\`Expand ${light.label} controls\`}`.
- **Files**: `client/src/pages/LightsPage.tsx`, `client/src/pages/DevicesPage.tsx`

### 2026-03-28 — LightCard control buttons below 44px touch target
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: accessibility
- **Description**: Identify and Power buttons in LightCard use `p-2` (~32px). Below 44px minimum. Used inside RoomDetailPage.
- **Fix**: Add `min-h-[44px] min-w-[44px]`.
- **Files**: `client/src/components/ui/LightCard.tsx`

### 2026-03-28 — SceneEditor search input missing aria-label
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: accessibility
- **Description**: Raw `<input>` without `aria-label` or `<label>`. Placeholder is not a substitute.
- **Fix**: Add `aria-label="Search lights by name"` or use `SearchInput` component.
- **Files**: `client/src/pages/SceneEditorPage.tsx`

### 2026-03-28 — LightsPage search input missing aria-label
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: accessibility
- **Fix**: Add `aria-label="Search lights by name or group"`.
- **Files**: `client/src/pages/LightsPage.tsx`

### 2026-03-28 — TimersSection cancel button is icon-only with no label and small target
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: accessibility
- **Description**: Cancel timer X button has no `aria-label` and is only 32px.
- **Fix**: Add `aria-label={\`Cancel timer: ${timer.sceneName}\`}` and `min-h-[44px]`.
- **Files**: `client/src/pages/SettingsPage.tsx`

---

## UX / Accessibility: Low

### 2026-03-28 — Retry buttons below 44px touch target on error states
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: accessibility
- **Description**: "Try again" buttons in error states are ~36px height.
- **Fix**: Add `min-h-[44px]`.
- **Files**: Multiple pages (RoomsPage, HomePage, ScenesPage)

### 2026-03-28 — Decorative icons missing aria-hidden across several components
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: accessibility
- **Description**: Lock/Unlock icons in NightModeSection, Settings page heading icon, NotificationPanel action icons all missing `aria-hidden="true"`.
- **Files**: `NightModeSection.tsx`, `SettingsPage.tsx`, `NotificationPanel.tsx`

### 2026-03-28 — WeatherCard and MtaCard silently disappear on fetch failure
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: ux-state
- **Description**: Both cards return `null` when fetch fails. Card disappears with no explanation. User doesn't know data is temporarily unavailable vs removed.
- **Fix**: Show compact error state: "Weather unavailable" / "Train times unavailable".
- **Files**: `client/src/pages/HomePage.tsx`

---

## Logging / Observability: High

### 2026-03-28 — No latency tracking for any external service
- **Severity**: high
- **Status**: resolved (PR #76)
- **Category**: observability
- **Description**: None of the six external API clients (LIFX, Hubitat, Kasa, Sonos, MTA, Weather) track or log response latency. Cannot diagnose "why did that scene take 3s?" from logs.
- **Fix**: Add wall-clock timing to `lifx-client.ts withRetry`. Log durations over 500ms under a `perf` category. Add timing to `scene-executor.ts` for Hubitat/Kasa calls.
- **Files**: All client files in `server/src/lib/`

---

## Logging / Observability: Medium

### 2026-03-28 — Motion log volume is extreme production noise (~550 entries/hr)
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: logging
- **Description**: 44,929 of 77,015 log rows (58%) in 6 days are motion category. High-frequency, low-signal entries (lux threshold skips, automation disabled, sensors still active) bury actionable logs. Log viewer defaults (25 rows DESC) are overwhelmed within seconds.
- **Fix**: Move intermediate decision-path messages behind `process.env.DEBUG`. Keep only actionable events (activation, timer, error). Would reduce volume ~60-70%.
- **Files**: `server/src/lib/motion-handler.ts`

### 2026-03-28 — Sonos events go only to console, not DB
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: logging
- **Description**: All Sonos follow-me, auto-play, zone polling events use `console.log('[sonos]')` only. Not queryable via `/api/system/logs?category=sonos`. Cannot diagnose "why didn't music follow me" from the log viewer.
- **Fix**: Write to `logs` table under `sonos` category, matching the pattern used everywhere else.
- **Files**: `server/src/lib/sonos-manager.ts`

### 2026-03-28 — No index on `logs.category` — slow filtered queries at scale
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: performance
- **Description**: `GET /api/system/logs?category=X` does a full table scan on 77K+ rows. No index on `category` or `(category, created_at)`.
- **Fix**: Add `CREATE INDEX IF NOT EXISTS idx_logs_category ON logs (category, created_at DESC)`.
- **Files**: `server/src/db/index.ts`

### 2026-03-28 — Kasa poller failures produce no DB log or notification
- **Severity**: medium
- **Status**: resolved (PR #76)
- **Category**: logging
- **Description**: When the entire Kasa sidecar poll fails, the error goes only to `console.error`. Sidecar crashes leave no queryable record.
- **Fix**: Write to `logs` table under `kasa` category on failure. Create warning notification after N consecutive failures.
- **Files**: `server/src/lib/kasa-poller.ts`

---

## Logging / Observability: Low

### 2026-03-28 — LIFX rate-limit events are silent
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: logging
- **Description**: 429 throttling and recovery in `lifx-client.ts` produce no DB log. Sustained throttling is invisible.
- **Files**: `server/src/lib/lifx-client.ts`

### 2026-03-28 — Weather/MTA indicator errors swallowed to console only
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: logging
- **Description**: Weather indicator errors go to `console.error` only. MTA per-stop failures are silently caught. Neither writes to DB.
- **Files**: `server/src/lib/weather-indicator.ts`, `server/src/lib/mta-indicator.ts`

### 2026-03-28 — Manual vs auto scene activation not distinguishable in logs
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: logging
- **Description**: Both manual (user-triggered) and auto (motion-triggered) activations log identical `Activating scene: X` messages.
- **Fix**: Add source context: `[manual]` vs `[auto]`.
- **Files**: `server/src/routes/scenes.ts`, `server/src/lib/scene-executor.ts`

### 2026-03-28 — Debug-level request body logs left in production
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: logging
- **Description**: `lights.ts` and `rooms.ts` routes unconditionally log full request bodies to PM2 stdout.
- **Fix**: Gate behind `process.env.DEBUG`.
- **Files**: `server/src/routes/lights.ts`, `server/src/routes/rooms.ts`

### 2026-03-28 — Socket.io connect/disconnect logged at info level permanently
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: logging
- **Description**: Every browser tab open/close generates console noise. Multiple devices + reconnects on network blips.
- **Fix**: Gate behind `process.env.DEBUG` or only log unexpected disconnects.
- **Files**: `server/src/index.ts`

### 2026-03-28 — `logs` table growth unbounded for motion category
- **Severity**: low
- **Status**: resolved (PR #76)
- **Category**: data-integrity
- **Description**: At 13,000 motion entries/day, steady-state is ~390K rows. Combined with no `(category, created_at)` index, query performance degrades.
- **Fix**: Either reduce motion verbosity (primary fix) or prune motion category more aggressively (7 days vs 30).
- **Files**: `server/src/lib/history-collector.ts`

---

## Documentation

### 2026-03-28 — features.md was completely empty
- **Severity**: high
- **Status**: resolved (2026-03-28)
- **Category**: documentation
- **Description**: `.specs/features.md` contained only an empty template despite 68 PRs and 14+ pages of shipped features. No user-facing feature documentation existed.
- **Fix**: Populated with complete 14-section feature inventory covering all pages and capabilities.
