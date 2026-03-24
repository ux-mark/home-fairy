# Pull Request Tracker

> Track all PRs created during sessions.
> This file is the handoff mechanism between sessions — a new agent reads it to understand what was last worked on.

---

<!-- PR entry format:

## PR #N — Title
- **Branch**: feature/branch-name → dev
- **Created**: YYYY-MM-DD
- **Status**: open | merged | closed
- **Merge date**: YYYY-MM-DD (if merged)
- **Branch cleanup**: done | pending (if merged)
- **Summary**: What this PR does
- **Files**: Key files modified

-->

## PR #2 — Fix scene toggle, sensor filtering, and sensor dropdown
- **Branch**: fix/scene-toggle-and-sensor-filter → dev
- **Created**: 2026-03-22
- **Status**: merged
- **Merge date**: 2026-03-22
- **Branch cleanup**: done
- **Summary**: Scene buttons toggle on/off with optimistic updates, WCAG AA contrast fix, Hubitat capability parsing fix for sensors, sensor dropdown in room detail, removed unused priority_threshold field
- **Files**: `client/src/pages/HomePage.tsx`, `client/src/pages/RoomDetailPage.tsx`, `server/src/routes/hubitat.ts`

## PR #3 — Rename Switches to Devices, add room counts, and homepage UX improvements
- **Branch**: feature/rename-switches-to-devices → dev
- **Created**: 2026-03-22
- **Status**: merged
- **Merge date**: 2026-03-22
- **Branch cleanup**: done
- **Summary**: Renamed Switches tab to Devices, added lights/devices/sensors text counts to rooms listing, removed duplicate active scene badge, made Auto/Manual badge tappable to toggle automation, removed redundant "No active scene" text
- **Files**: `client/src/pages/HomePage.tsx`, `client/src/pages/RoomDetailPage.tsx`, `client/src/pages/RoomsPage.tsx`

## PR #4 — Update UX standards: emojis, icons, and all-caps rules
- **Branch**: (unknown) → dev
- **Created**: 2026-03-22
- **Status**: merged
- **Merge date**: 2026-03-22
- **Branch cleanup**: done
- **Summary**: Updated agent definitions and CLAUDE.md with UX standards for emoji usage, icon-only anti-pattern, and all-caps rules
- **Files**: `.claude/agents/builder.md`, `.claude/agents/reviewer.md`, `CLAUDE.md`

## PR #8 — Rebrand to Home Fairy + new icon
- **Branch**: feature/home-fairy-rebrand → dev
- **Created**: 2026-03-22
- **Status**: merged
- **Merge date**: 2026-03-22
- **Branch cleanup**: done
- **Summary**: Renamed user-facing text from "The Fairies" to "Home Fairy", replaced icon SVG with final mushroom cottage + fairy wings design, added favicon, page title, sidebar icon, disabled modulePreload warning
- **Files**: `client/public/home-fairy-icon.svg`, `client/public/favicon.svg`, `client/index.html`, `client/src/components/layout/AppLayout.tsx`, `client/vite.config.ts`, `server/src/index.ts`, `package.json`

## PR #9 — Preserve manually activated scenes during motion updates
- **Branch**: fix/manual-scene-override → dev
- **Created**: 2026-03-22
- **Status**: merged
- **Merge date**: 2026-03-22
- **Branch cleanup**: done
- **Summary**: Manually activated scenes persist during motion updates instead of reverting to default auto scene. Added scene_manual flag to rooms table.
- **Files**: `server/src/db/index.ts`, `server/src/lib/motion-handler.ts`, `server/src/lib/scene-executor.ts`, `server/src/routes/scenes.ts`

## PR #10 — Fix weather timeout 500s and PWA preload warnings
- **Branch**: fix/weather-timeout-and-preload-warning → dev
- **Created**: 2026-03-22
- **Status**: merged
- **Merge date**: 2026-03-22
- **Branch cleanup**: done
- **Summary**: Weather API timeouts return stale cache instead of 500; PWA SW no longer precaches JS chunks to eliminate preload warnings
- **Files**: `server/src/lib/weather-client.ts`, `client/vite.config.ts`

## PR #5 — Fix MTA indicator: platform wait, status re-evaluation, periodic updates
- **Branch**: fix/mta-indicator-logic → dev
- **Created**: 2026-03-22
- **Status**: merged
- **Merge date**: 2026-03-22
- **Branch cleanup**: done
- **Summary**: Fixed maxWaitMinutes to represent platform wait tolerance, re-evaluate status colour from catchable trains instead of always red, periodic 30s light updates for walkTime+maxWaitMinutes window, extracted MtaIndicatorManager, removed duration config, light turns off after window expires, UI microcopy improvements
- **Files**: `server/src/lib/mta-client.ts`, `server/src/lib/mta-indicator.ts`, `server/src/lib/motion-handler.ts`, `server/src/routes/system.ts`, `client/src/lib/api.ts`, `client/src/pages/SettingsPage.tsx`, `client/src/pages/HomePage.tsx`

## PR #11 — Suppress indicator lights when room is off or locked
- **Branch**: fix/indicator-room-awareness → dev
- **Created**: 2026-03-22
- **Status**: merged
- **Merge date**: 2026-03-22
- **Branch cleanup**: done
- **Summary**: MTA and weather indicator lights now respect room state — suppressed when room is locked (night/guest night), automation disabled, or manual scene override active
- **Files**: `server/src/lib/motion-handler.ts`, `server/src/lib/weather-indicator.ts`

## PR #13 — Add text label to Keep On toggle, add device config to Devices page
- **Branch**: fix/keep-on-toggle-label-and-devices-page → dev
- **Created**: 2026-03-23
- **Status**: merged
- **Merge date**: 2026-03-23
- **Branch cleanup**: done
- **Summary**: Fixed icon-only anti-pattern on Keep On toggle (added text label), added Keep On toggle to Devices page for hub devices, added PATCH endpoint for device config updates, logged discovered issues
- **Files**: `server/src/routes/hubitat.ts`, `client/src/lib/api.ts`, `client/src/pages/RoomDetailPage.tsx`, `client/src/pages/DevicesPage.tsx`, `.claude/memory/issues.md`

## PR #14 — Fix TypeScript build errors: missing fields and unused imports
- **Branch**: fix/ts-errors-cleanup → dev
- **Created**: 2026-03-23
- **Status**: merged
- **Merge date**: 2026-03-23
- **Branch cleanup**: done
- **Summary**: Added missing `attributes` field to `HubDevice` interface and `description` field to `WeatherColorEntry` interface, removed all unused imports/variables across 5 client files. `tsc --noEmit` now passes clean.
- **Files**: `client/src/lib/api.ts`, `client/src/pages/DevicesPage.tsx`, `client/src/pages/HomePage.tsx`, `client/src/pages/RoomDetailPage.tsx`, `client/src/pages/SettingsPage.tsx`, `client/src/components/ui/CollapsibleDeviceGroup.tsx`, `client/src/components/ui/ColorBrightnessPicker.tsx`

## PR #15 — Refactor Settings page into grouped accordion with ALL CAPS fix
- **Branch**: feature/settings-accordion-ux → dev
- **Created**: 2026-03-23
- **Status**: merged
- **Merge date**: 2026-03-23
- **Branch cleanup**: done
- **Summary**: Groups 11 flat Settings sections into 5 collapsible accordion categories (Preferences, Night and schedule, Public transport, Weather, System). Removes ALL CAPS from section titles, borough labels, and sub-headers. Smooth CSS grid-rows animation, full a11y.
- **Files**: `client/src/pages/SettingsPage.tsx`

## PR #16 — Persist room locks to database, respect Sleep Time in scheduler
- **Branch**: fix/persist-room-locks → dev
- **Created**: 2026-03-23
- **Status**: merged
- **Merge date**: 2026-03-23
- **Branch cleanup**: done
- **Summary**: Room locks persisted to current_state DB table (survive restarts); sun scheduler skips transitions when mode is Sleep Time
- **Files**: `server/src/lib/motion-handler.ts`, `server/src/lib/sun-mode-scheduler.ts`

## PR #17 — Add Insights dashboard with energy monitoring, device intelligence, and room analytics
- **Branch**: feature/dashboard-insights → dev
- **Created**: 2026-03-23
- **Status**: open
- **Merge date**: —
- **Branch cleanup**: pending
- **Summary**: Complete Insights experience: Insights page with Energy/Battery/Environment/Activity/Sun cards, attention bar with CTAs, home summary strip, multi-room overlay charts, device detail with headline insights and layered drill-down, room intelligence on room detail pages, activity tracking (room_activity table), insights engine with trend analysis and anomaly detection, device history infrastructure, energy/battery data on device cards, configurable currency and energy rate, Socket.io real-time updates. 4 personas documented.
- **Files**: 39 files changed (+6,467 lines) — 12 commits

## PR #12 — Update default exclude rooms for night modes
- **Branch**: fix/nighttime-default-exclude-rooms → dev
- **Created**: 2026-03-22
- **Status**: merged
- **Merge date**: 2026-03-22
- **Branch cleanup**: done
- **Summary**: Updated default exclude rooms for Nighttime and Guest Night scenes
- **Files**: `server/src/routes/system.ts`
