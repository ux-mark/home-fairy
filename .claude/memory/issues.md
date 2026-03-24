# Known Issues

> Track bugs, tech debt, and problems discovered during sessions.
> Format: date discovered, description, severity, status (open/resolved/wontfix).

---

## 2026-03-23 — Direct URL access to SPA routes returns 404 in production
- **Severity**: medium
- **Status**: open
- **Description**: In production (PM2), navigating directly to `/dashboard`, `/devices/123`, `/rooms/Living`, or any non-root route returns a 404 error. The Express server serves static files from `client/dist` via `express.static()` but has no SPA fallback to serve `index.html` for unmatched routes.
- **Impact**: Users can't bookmark or share deep links. Refreshing the browser on any page other than `/` shows a 404. Only affects production — Vite dev server handles this correctly.
- **Fix**: Add a catch-all route after static middleware: `app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')))` — must be placed after all API routes and static file serving.
- **Note**: Pre-existing issue, not introduced by dashboard feature.

## 2026-03-23 — Room locks lost on server restart (in-memory only)
- **Severity**: critical
- **Status**: resolved (2026-03-23)
- Room locks were stored in an in-memory `Set<string>` in `motion-handler.ts` — lost on every server restart
- With multiple server restarts overnight, locks from Nighttime/Guest Night were silently wiped
- This allowed MTA indicator, weather indicator, and motion-triggered scenes to activate in locked rooms
- **Resolution**: Persisted locks to `current_state` table as `locked_rooms` JSON array; loaded on startup (PR #16)

## 2026-03-23 — Sun mode scheduler overwrites Sleep Time mode
- **Severity**: high
- **Status**: resolved (2026-03-23)
- The sun scheduler's catch-up logic and scheduled transitions blindly overwrote any mode, including manually-set "Sleep Time"
- On restart or midnight refresh, "Sleep Time" was replaced with the sun-calculated mode (e.g. "Night")
- **Resolution**: Scheduler now checks for "Sleep Time" and skips transitions when set (PR #16)

## 2026-03-23 — LIFX lights ignore room exclusions during All Off / Nighttime
- **Severity**: medium
- **Status**: open
- `runAllOff()` in `server/src/routes/system.ts:828-835` sends `lifxClient.setState('all', { power: 'off' })` which turns off ALL LIFX lights unconditionally, ignoring both room-level exclusions and any per-device exclusion
- The `exclude_from_all_off` config only applies to Hubitat devices (switches, dimmers, twinkly, fairy) — LIFX lights in the `light_rooms` table have no `config` column to store this flag
- Same issue in scene executor's `all_off` command (`server/src/lib/scene-executor.ts:165-167`)
- **Impact**: If a user wants a LIFX light to stay on during Nighttime/All Off, there's no way to configure that
- **Fix**: Replace `setState('all', ...)` with per-light off commands that respect room and device exclusions; add config column to `light_rooms`

## 2026-03-23 — HubDevice type missing `attributes` field
- **Severity**: low
- **Status**: resolved (2026-03-23)
- `client/src/lib/api.ts:142` — `HubDevice` interface doesn't declare `attributes` despite the backend returning it
- **Resolution**: Added `attributes: Record<string, unknown>` to `HubDevice` interface, removed unsafe cast in DevicesPage (PR #14)

## 2026-03-23 — Multiple pre-existing unused import/variable TS errors in client
- **Severity**: low
- **Status**: resolved (2026-03-23)
- `CollapsibleDeviceGroup.tsx`, `ColorBrightnessPicker.tsx`, `HomePage.tsx`, `RoomDetailPage.tsx`, `SettingsPage.tsx` all had unused imports or variables
- **Resolution**: Removed all unused imports/variables, `tsc --noEmit` now passes clean (PR #14)

## 2026-03-23 — XO-prefixed device names still in use
- **Severity**: low
- **Status**: open
- Devices like "XO Plant Life" still use the old naming convention where "XO" prefix meant "exclude from off"
- Now that `exclude_from_all_off` config exists, these devices should be renamed to drop the "XO" prefix and have their config flag set instead
- **Impact**: Cosmetic — the XO prefix no longer has functional meaning but may confuse users

## 2026-03-22 — GitHub token lacks PR creation permissions
- **Severity**: low
- **Status**: resolved (2026-03-22)
- `gh pr create` fails with "Resource not accessible by personal access token"
- **Resolution**: User updated the personal access token with full repo permissions
