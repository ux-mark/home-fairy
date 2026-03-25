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
- **Status**: merged
- **Merge date**: 2026-03-23
- **Branch cleanup**: done
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

## PR #19 — Add LIFX light retry mechanism and notification system
- **Branch**: feature/notifications-and-retry → dev
- **Created**: 2026-03-24
- **Status**: merged
- **Merge date**: 2026-03-24
- **Branch cleanup**: done
- **Summary**: LIFX batch setStates now inspects per-light results and retries failed lights individually (2s delay, 2 retries, rate limit guard). New notification system with dedup, severity levels, bell icon + panel in header, Socket.io real-time push. Battery and device error notifications wired in. Insights AttentionBar shows device errors.
- **Files**: 14 files (7 server, 7 client) — lifx-client.ts, scene-executor.ts, notification-service.ts (new), insights-engine.ts, db/index.ts, index.ts, routes/system.ts, api.ts, useSocket.ts, useNotifications.ts (new), NotificationBell.tsx (new), NotificationPanel.tsx (new), AppLayout.tsx, LogsPage.tsx

## PR #20 — Fix timezone handling in charts and insights queries
- **Branch**: fix/timezone-charts → dev
- **Created**: 2026-03-23
- **Status**: merged
- **Merge date**: 2026-03-24
- **Branch cleanup**: done
- **Summary**: Chart components used new Date() on bare UTC SQLite timestamps, displaying wrong times. Now uses parseServerDate(). Server-side strftime calls now use 'localtime' modifier for peak hours, hourly patterns, and daily kWh grouping.
- **Files**: `client/src/components/dashboard/TimeSeriesChart.tsx`, `client/src/components/dashboard/EnvironmentCard.tsx`, `server/src/routes/dashboard.ts`, `server/src/lib/insights-engine.ts`

## PR #18 — Fix colour picker: use rectangle for brightness, remove redundant slider
- **Branch**: fix/color-picker-brightness-ux → dev
- **Created**: 2026-03-23
- **Status**: merged
- **Merge date**: 2026-03-23
- **Branch cleanup**: done
- **Summary**: HSV rectangle's V-axis now drives brightness directly; separate brightness slider removed for colour lights (kept for kelvin). Two controls instead of three. Live preview sends power:on so lights that start off turn on when previewed.
- **Files**: `client/src/components/ui/ColorBrightnessPicker.tsx`, `client/src/pages/SceneEditorPage.tsx`

## PR #21 — Make modes fully configurable with triggers and scheduling
- **Branch**: feature/configurable-modes → dev
- **Created**: 2026-03-24
- **Status**: merged
- **Merge date**: 2026-03-24
- **Branch cleanup**: done
- **Summary**: Modes are now fully configurable with add/rename/delete and cascade safety. New mode_triggers table supports sun and time triggers. Sun scheduler rewritten to be data-driven. New time-trigger-scheduler for clock-based transitions. Settings UI restructured with drill-down mode detail, inline trigger management, and dependency-aware delete confirmation.
- **Files**: server/src/db/index.ts, server/src/routes/system.ts, server/src/lib/sun-mode-scheduler.ts, server/src/lib/time-trigger-scheduler.ts (new), server/src/index.ts, client/src/lib/api.ts, client/src/components/modes/ModesList.tsx (new), client/src/components/modes/ModeDetail.tsx (new), client/src/components/modes/modeUtils.ts (new), client/src/pages/SettingsPage.tsx

## PR #22 — Redesign scenes UX with room+mode organization
- **Branch**: feature/scenes-ux-redesign → dev
- **Created**: 2026-03-24
- **Status**: merged
- **Merge date**: 2026-03-24
- **Branch cleanup**: done
- **Summary**: Scenes page rewritten with room-first accordion view, mode pills, and 4-tab view switcher (By room/Active/Recent/Stale). Room Detail gains collapsible Scenes section. Homepage scene buttons sorted alphabetically with default star and 44px targets. Backend tracks last_activated_at. Shared scene-utils.ts.
- **Files**: server/src/db/index.ts, server/src/lib/scene-executor.ts, server/src/routes/scenes.ts, client/src/lib/api.ts, client/src/lib/scene-utils.ts (new), client/src/pages/ScenesPage.tsx, client/src/pages/RoomDetailPage.tsx, client/src/pages/HomePage.tsx

## PR #23 — Normalise schema: replace JSON columns with relational tables
- **Branch**: refactor/legacy-data-cleanup → main
- **Created**: 2026-03-24
- **Status**: merged
- **Merge date**: 2026-03-24
- **Branch cleanup**: done
- **Summary**: Drop dead columns (hub_devices.room_name/last_event, rooms.mode_changed). Remove Sensor.priority_threshold. Migrate rooms.sensors JSON → device_rooms. Create modes table (replaces all_modes JSON). Create scene_rooms + scene_modes junction tables (replaces scenes.rooms/modes JSON). Refactor rooms.temperature/lux cache → read from hub_devices.attributes. Scene CRUD wrapped in transactions. FK cascades for mode rename/delete.
- **Files**: 15 files — server/src/db/index.ts, server/src/routes/dashboard.ts, server/src/routes/hubitat.ts, server/src/routes/rooms.ts, server/src/routes/scenes.ts, server/src/routes/system.ts, server/src/lib/motion-handler.ts, server/src/lib/scene-executor.ts, server/src/lib/history-collector.ts, server/src/index.ts, client/src/lib/api.ts, client/src/pages/DeviceDetailPage.tsx, client/src/pages/RoomDetailPage.tsx, client/src/pages/RoomsPage.tsx, client/src/pages/SettingsPage.tsx

## PR #24 — Standardize UI: shared accordion, badges, navigation, and LIFX detail pages
- **Branch**: refactor/ui-consistency → dev
- **Created**: 2026-03-24
- **Status**: merged
- **Merge date**: 2026-03-24
- **Branch cleanup**: done
- **Summary**: 6 shared UI primitives (Accordion, BackLink, Badge, SearchInput, EmptyState, FilterChip) replacing 5+ inline implementations. All RoomDetailPage sections collapsible. New LightDetailPage for LIFX lights. Standardized headers, back nav, filter chips, search inputs, badges, empty states across all pages. Deleted CollapsibleDeviceGroup.
- **Files**: 18 files — Accordion.tsx (new), BackLink.tsx (new), Badge.tsx (new), EmptyState.tsx (new), FilterChip.tsx (new), SearchInput.tsx (new), LightDetailPage.tsx (new), CollapsibleDeviceGroup.tsx (deleted), App.tsx, RoomIntelligence.tsx, DashboardPage.tsx, DeviceDetailPage.tsx, DevicesPage.tsx, HomePage.tsx, LogsPage.tsx, RoomDetailPage.tsx, RoomsPage.tsx, ScenesPage.tsx

## PR #25 — Fix accordion spacing and remove LIFX expand chevrons
- **Branch**: fix/accordion-spacing → dev
- **Created**: 2026-03-24
- **Status**: merged
- **Merge date**: 2026-03-24
- **Branch cleanup**: done
- **Summary**: Even spacing between RoomDetailPage accordion sections (space-y-4 container replacing mixed mb-8/mb-4). Removed expand chevron, inline brightness slider, and LightUsagePanel from LIFX light cards on DevicesPage — lights now link to /lights/:id for details. Added TypeBadge to light cards for visual consistency with hub device cards.
- **Files**: RoomDetailPage.tsx, RoomIntelligence.tsx, DevicesPage.tsx

## PR #26 — Replace Hubitat Kasa integration with direct python-kasa sidecar
- **Branch**: feature/kasa-direct-integration → dev
- **Created**: 2026-03-24
- **Status**: open
- **Summary**: Python FastAPI sidecar using python-kasa for direct local Kasa device control. New kasa_devices table, Express HTTP client + poller, Kasa API routes, scene/system integration, Kasa Setup page, DevicesPage/DeviceDetailPage Kasa support, HS300 per-outlet monitoring, PM2 config, deploy script updates.
- **Files**: 8 new + 14 modified — server/kasa/* (4 Python), kasa-client.ts, kasa-poller.ts, routes/kasa.ts, KasaSetupPage.tsx, db/index.ts, index.ts, scene-executor.ts, scenes.ts, system.ts, history-collector.ts, api.ts, DevicesPage.tsx, DeviceDetailPage.tsx, SettingsPage.tsx, App.tsx, Badge.tsx, ecosystem.config.cjs, deploy-to-pi.sh, .gitignore, PROJECT_SPEC.md
