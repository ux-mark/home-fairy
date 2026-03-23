# Known Issues

> Track bugs, tech debt, and problems discovered during sessions.
> Format: date discovered, description, severity, status (open/resolved/wontfix).

---

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
- **Status**: open
- `client/src/lib/api.ts:142` — `HubDevice` interface doesn't declare `attributes` despite the backend returning it
- DevicesPage uses `d.attributes as Record<string, unknown>` cast to work around this (`DevicesPage.tsx:519`)
- Causes TS build error `TS2339: Property 'attributes' does not exist on type 'HubDevice'`
- **Fix**: Add `attributes: Record<string, unknown>` to the `HubDevice` interface

## 2026-03-23 — Multiple pre-existing unused import/variable TS errors in client
- **Severity**: low
- **Status**: open
- `CollapsibleDeviceGroup.tsx`, `ColorBrightnessPicker.tsx`, `HomePage.tsx`, `RoomDetailPage.tsx`, `SettingsPage.tsx` all have unused imports or variables flagged by `tsc --noEmit`
- These don't block `tsx` runtime but would block a strict CI build
- **Fix**: Clean up unused imports/variables across affected files

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
