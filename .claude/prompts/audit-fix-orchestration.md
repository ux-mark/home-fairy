# Audit Fix Orchestration Prompt

Paste this into a fresh Claude Code session in the `/home/queen/thefairies-app` directory.

---

## Prompt

You are picking up a comprehensive product audit. Read CLAUDE.md fully first — it governs everything you do. Then read:

- `.specs/PROJECT_SPEC.md` (tech stack, commands, conventions)
- `.specs/features.md` (feature inventory)
- `.specs/personas.md` (user personas)
- `.claude/memory/decisions.md`, `.claude/memory/changelog.md`, `.claude/memory/issues.md`, `.claude/memory/prs.md`

The audit findings are in `.claude/memory/issues.md` under the section **"Comprehensive Product Audit (2026-03-28)"**. There are 41 issues across backend, frontend, UX/accessibility, and logging/observability. Your job is to fix ALL of them across multiple PRs.

### Work Streams

Organise the fixes into these PRs, in this order. Each PR is a feature branch off `dev`, merged into `dev` via `gh pr create`. Follow the git workflow in CLAUDE.md Section 4 exactly — never commit to `dev` directly.

**PR 1 — Critical: Schema DDL and data integrity fixes**
Branch: `fix/schema-ddl-and-data-integrity`
- Add `active INTEGER DEFAULT 1` to `CREATE TABLE` for `hub_devices`, `kasa_devices`, `light_rooms` in `db/index.ts`
- Add `ALTER TABLE ... ADD COLUMN active` migration guards in `initDb()` for all three tables
- Wrap `JSON.parse(s.commands)` in `dashboard.ts` device context endpoint in try/catch
- Add safety comment to the `cutoff` SQL interpolation in `dashboard.ts` history endpoint
- **Verify**: `cd server && npx tsc --noEmit` passes. Server starts clean.

**PR 2 — Backend reliability fixes**
Branch: `fix/backend-reliability`
- Add `syncInProgress` mutex to `POST /devices/sync` in `hubitat.ts` (reject concurrent with 409)
- Fix `webhookHits` memory leak: delete map key when filtered array is empty in `index.ts`
- Add `shutdown()` method to `MotionHandler` that clears all `roomTimers`. Call from SIGTERM handler in `index.ts`.
- Add `shuttingDown` flag to `sonos-manager.ts` zone polling to prevent rescheduling after shutdown
- Defer `pruneOldLogs()` with `setTimeout(..., 60_000)` in `history-collector.ts`
- Add second retry cycle or 2s minimum wait floor to `lifx-client.ts` `withRetry`
- Fix Kasa sidecar PM2 startup ordering: add `restart_delay: 2000` to the main server in `ecosystem.config.cjs` so the sidecar has a head start on cold boot. Or add `wait_ready: true` to the sidecar config.
- **Verify**: `cd server && npx tsc --noEmit` passes. Server starts and shuts down cleanly.

**PR 3 — Frontend socket and timer fixes**
Branch: `fix/frontend-socket-and-timers`
- DevicesPage: Replace direct `socketIo()` call with `getSocket()` singleton from `useSocket.ts`. Register/deregister handlers with `.on()`/`.off()` only.
- RoomDetailPage: Same fix — use `getSocket()` singleton instead of creating new connection.
- SonosDetailPage: Add cleanup `useEffect` that clears `liveVolumeTimer` and `volumeSaveTimer` on unmount.
- SceneEditorPage: Remove `eslint-disable-next-line` suppression on `deactivatedCount` useMemo. Inline the `.has()` checks directly, remove wrapper functions from deps.
- **Verify**: `cd client && npx tsc --noEmit` passes. `cd client && npx eslint .` passes (or only pre-existing warnings). Test pages manually if dev server is running.

**PR 4 — Frontend correctness fixes**
Branch: `fix/frontend-correctness`
- EnvironmentCard: Replace `getTempUnit()` localStorage read with `useQuery({ queryKey: ['system', 'preferences'] })` to match WeatherCard pattern.
- useSocket.ts: Add `queryClient.invalidateQueries({ queryKey: ['system', 'night-status'] })` in the `handleModeChange` handler.
- Centralise Chart.js registration: Create `client/src/lib/chartSetup.ts` with all `Chart.register()` calls. Import it once in `main.tsx`. Remove scattered registrations from `TimeSeriesChart.tsx`, `ActivityCard.tsx`, `EnvironmentCard.tsx`.
- EnergyCard `DeviceTrendChart`: Replace `deviceLabel` with stable device ID in the TanStack Query key. If the API uses label as the identifier, add the device's stable ID (MAC for Kasa, numeric ID for Hub) alongside the label in the query key so renames don't orphan cache entries. Update the API call to use the stable ID if supported, or document the limitation.
- **Verify**: `cd client && npx tsc --noEmit` passes.

**PR 5 — Accessibility fixes**
Branch: `fix/accessibility-audit`
- SceneEditorPage `OptionToggle`: Add `aria-label={label}` to `<Switch.Root>`.
- SceneEditorPage search input: Add `aria-label="Search lights by name"` (or replace with `SearchInput` component).
- LightsPage search input: Add `aria-label="Search lights by name or group"`.
- LightsPage + DevicesPage expand/collapse buttons: Change `aria-label` to include device name (e.g., `` aria-label={`Expand ${light.label} controls`} ``).
- LightCard: Add `min-h-[44px] min-w-[44px]` to Identify and Power buttons.
- LightsPage + LightCard connection status icons: Add `aria-label="Connected"` or `aria-label="Disconnected"` to the icon (or add `sr-only` span).
- SettingsPage TimersSection cancel button: Add `` aria-label={`Cancel timer: ${timer.sceneName}`} `` and `min-h-[44px] min-w-[44px]`.
- Retry buttons on error states (RoomsPage, HomePage, ScenesPage): Add `min-h-[44px]`.
- NightModeSection: Add `aria-hidden="true"` to Lock and Unlock icons.
- SettingsPage: Add `aria-hidden="true"` to Settings heading icon.
- NotificationPanel: Add `aria-hidden="true"` to Mark all read and Clear all button icons.
- HomePage MTA card: Remove `truncate` class from accordion summary text. Allow wrapping.
- HomePage WeatherCard: Show "Weather unavailable" on fetch error instead of returning null.
- HomePage MtaCard: Show "Train times unavailable" on fetch error instead of returning null.
- **Verify**: `cd client && npx tsc --noEmit` passes. Spot-check changed pages for visual regressions.

**PR 6 — Logging and observability improvements**
Branch: `feature/logging-observability`
- Add `CREATE INDEX IF NOT EXISTS idx_logs_category ON logs (category, created_at DESC)` to `initDb()` in `db/index.ts`.
- `motion-handler.ts`: Gate intermediate decision-path log messages behind `process.env.DEBUG`. Keep actionable events (activation, timer, error) unconditional. Target messages: "automation disabled", "some sensors still active", "lux exceeds threshold", "manual override active", "room locked".
- `sonos-manager.ts`: Replace `console.log` with DB log writes under `sonos` category, matching the `log()` pattern used in `motion-handler.ts` and `scene-executor.ts`.
- `kasa-poller.ts`: On total poll failure, write to `logs` table under `kasa` category (not just console.error).
- `lifx-client.ts`: When a 429 is encountered in `withRetry`, write a warn-level log entry including wait duration.
- `weather-indicator.ts`: Write weather indicator errors to DB under `weather` category instead of console.error only.
- `mta-indicator.ts`: Log aggregate failure message when stops fail in `_updateLight`.
- `scenes.ts` route / `scene-executor.ts`: Add `[manual]` vs `[auto]` source context to scene activation log messages.
- `lights.ts` and `rooms.ts`: Gate request body `console.log` debug lines behind `process.env.DEBUG`.
- `index.ts`: Gate Socket.io connect/disconnect logging behind `process.env.DEBUG`.
- **Verify**: `cd server && npx tsc --noEmit` passes. Check that the log viewer at `/settings/logs` still works and shows the new `sonos` category.

**PR 7 — Deploy script hardening**
Branch: `fix/deploy-script-hardening`
- Timestamp backup files: change `.pre-deploy-backup` to `.backup-$(date +%Y%m%d-%H%M%S)`. Keep last 5 backups (delete older).
- Make DB copy opt-in: only copy if `--include-db` flag is passed. Default deploy skips DB copy.
- Document the change in a comment at the top of the script.
- **Verify**: Read the script end-to-end. Run `bash -n deploy-to-pi.sh` for syntax check.

### Delegation Strategy

For each PR:
1. Create the feature branch from `dev`
2. Spawn builder agent(s) in parallel for independent file changes within that PR
3. After builders complete, run quality gates (`tsc --noEmit` for both client and server, `eslint` for client)
4. If gates pass, commit with specific file staging (never `git add .`)
5. Create PR into `dev` with `gh pr create`
6. Log in `.claude/memory/prs.md`
7. Ask the user if they want to merge before moving to the next PR
8. After merge: pull dev, delete branch, update `prs.md`

For PRs with many small independent changes (like PR 5 accessibility), spawn multiple builders in parallel — each handling a subset of files.

### After All PRs

1. Update `.claude/memory/issues.md` — mark each fixed issue as `resolved` with the PR number
2. Update `.claude/memory/changelog.md` with all completed work
3. Clean up stale remote branch `feature/insights-progressive-disclosure`
4. Clean up PR #68 branch (check if already merged, delete if so)
5. Suggest a `dev` → `main` sync PR to the user
6. Restart PM2: `pm2 restart all`

### Important Notes

- The scene emoji-to-icon migration (replacing freeform emoji input with IconPicker) is **excluded by user decision**. Existing emoji icons stay as-is for now.
- The `deploy-to-pi.sh` DB overwrite fix (PR 7) changes deployment behaviour. Confirm with the user before merging.
- Always run `pm2 restart all` after the final merge so the production Pi picks up all changes.
