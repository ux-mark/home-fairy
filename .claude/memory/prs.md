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
- **Status**: merged
- **Merge date**: 2026-03-25
- **Branch cleanup**: done
- **Summary**: Python FastAPI sidecar using python-kasa for direct local Kasa device control. New kasa_devices table, Express HTTP client + poller, Kasa API routes, scene/system integration, Kasa Setup page, DevicesPage/DeviceDetailPage Kasa support, HS300 per-outlet monitoring, PM2 config, deploy script updates.
- **Files**: 8 new + 14 modified — server/kasa/* (4 Python), kasa-client.ts, kasa-poller.ts, routes/kasa.ts, KasaSetupPage.tsx, db/index.ts, index.ts, scene-executor.ts, scenes.ts, system.ts, history-collector.ts, api.ts, DevicesPage.tsx, DeviceDetailPage.tsx, SettingsPage.tsx, App.tsx, Badge.tsx, ecosystem.config.cjs, deploy-to-pi.sh, .gitignore, PROJECT_SPEC.md

## PR #28 — Fix sleep mode blocking wake mode trigger
- **Branch**: fix/sleep-mode-wake-trigger → dev
- **Created**: 2026-03-25
- **Status**: merged
- **Merge date**: 2026-03-25
- **Branch cleanup**: done
- **Summary**: Both sun and time schedulers unconditionally blocked all transitions during sleep mode, including the wake mode trigger. Fixed to allow wake mode transitions through the sleep guard.
- **Files**: server/src/lib/sun-mode-scheduler.ts, server/src/lib/time-trigger-scheduler.ts

## PR #29 — Simplify scene model: default scenes per room+mode
- **Branch**: feature/replace-priority-with-auto-scenes → dev
- **Created**: 2026-03-25
- **Status**: merged
- **Merge date**: 2026-03-25
- **Branch cleanup**: done
- **Summary**: Removed auto_activate flag and priority — every scene is equal. room_default_scenes table for one default per room+mode. Default scene manageable from Scene Editor (with replacement warnings) and Room Detail. All "auto" terminology replaced with "default".
- **Files**: 16 files (6 server, 6 client, 4 memory/spec)

## PR #30 — Production readiness: resolve 47 open issues
- **Branch**: feature/production-readiness → dev
- **Created**: 2026-03-25
- **Status**: merged
- **Merge date**: 2026-03-25
- **Branch cleanup**: done
- **Summary**: Comprehensive production readiness pass across 7 phases: infrastructure (graceful shutdown, PM2 compiled JS, deploy hardening), security (webhook auth, rate limiting, body limits, generic errors), data integrity (log pruning, cycle detection, transactions, lock-based weather indicator), UX error states (5 pages), accessibility (6 fixes), UX consistency (truncate removal, empty states, LIFX exclusions), code quality (11 fixes including N+1 elimination, Zod validation, debounce)
- **Files**: 40 files (745 insertions, 405 deletions)

## PR #31 — Fix missing Link import in SceneEditorPage
- **Branch**: fix/scene-editor-link-import → dev
- **Created**: 2026-03-25
- **Status**: merged
- **Merge date**: 2026-03-25
- **Branch cleanup**: done
- **Summary**: Restored `Link` import from react-router-dom that was accidentally removed in commit 1817068 when BackLink was added. Link is still used for device/room links in the scene editor — its removal broke scene view/edit/create.
- **Files**: `client/src/pages/SceneEditorPage.tsx`

## PR #32 — Fix scene and mode ordering to respect user preferences
- **Branch**: fix/scene-and-mode-ordering → dev
- **Created**: 2026-03-25
- **Status**: merged
- **Merge date**: 2026-03-25
- **Branch cleanup**: done
- **Summary**: Added sort_order to scenes table, reorder endpoints for both scenes and modes, fixed frontend mode ordering to respect display_order instead of alphabetical sort, fixed pre-existing TS build errors
- **Files**: `server/src/db/index.ts`, `server/src/routes/scenes.ts`, `server/src/routes/system.ts`, `client/src/lib/api.ts`, `client/src/lib/scene-utils.ts`, `client/src/pages/ScenesPage.tsx`, `client/src/pages/RoomDetailPage.tsx`, `client/src/pages/DeviceDetailPage.tsx`, `client/src/pages/DevicesPage.tsx`

## PR #33 — Fix device-room ID mismatch and Kasa insight links
- **Branch**: fix/device-room-id-mismatch → dev
- **Created**: 2026-03-25
- **Status**: merged
- **Merge date**: 2026-03-25
- **Branch cleanup**: done
- **Summary**: Fixed sensor device_id stored as label instead of numeric hub ID (with migration for existing data), and fixed Insights "View device" links routing Kasa devices to the wrong detail page
- **Files**: `server/src/db/index.ts`, `server/src/routes/rooms.ts`, `server/src/routes/dashboard.ts`, `server/src/lib/insights-engine.ts`, `client/src/lib/api.ts`, `client/src/pages/RoomDetailPage.tsx`, `client/src/components/dashboard/AttentionBar.tsx`

## PR #34 — Improve device management UX
- **Branch**: feature/device-management-ux → dev
- **Created**: 2026-03-25
- **Status**: merged
- **Merge date**: 2026-03-26
- **Branch cleanup**: done
- **Summary**: Remove Kasa model names from device listing cards, promote power strip sockets to top-level devices with full controls, fix sensor double-counting on Rooms page, add sensors to Devices page with dedicated SensorCard and filter tab, rename "outlet" to "socket" in all UI text, add parent strip link on socket cards and detail page, fix badge colour mapping for server "outlet" device_type
- **Files**: `client/src/pages/DevicesPage.tsx`, `client/src/pages/DeviceDetailPage.tsx`, `client/src/pages/KasaSetupPage.tsx`, `client/src/pages/RoomsPage.tsx`, `client/src/components/ui/Badge.tsx`, `server/src/lib/kasa-poller.ts`

## PR #35 — Fix sensor ghost-active bug, nighttime all-off, and button UX
- **Branch**: fix/night-bugs-and-sensor-init → dev
- **Created**: 2026-03-26
- **Status**: merged
- **Merge date**: 2026-03-26
- **Branch cleanup**: done
- **Summary**: Fix unreported sensors treated as active (Living room stuck on 2.5h), Nighttime now turns off ALL lights including excluded rooms (excluded rooms stay unlocked for motion), parallelize runAllOff device commands, add loading spinners to quick action buttons, increase client timeout to 30s, update settings copy explaining Nighttime vs Guest Night distinction
- **Files**: `server/src/lib/motion-handler.ts`, `server/src/routes/system.ts`, `client/src/lib/api.ts`, `client/src/pages/HomePage.tsx`, `client/src/pages/WatchPage.tsx`, `client/src/pages/SettingsPage.tsx`

## PR #36 — Add device deactivation system with health tracking
- **Branch**: feature/device-deactivation → dev
- **Created**: 2026-03-26
- **Status**: merged
- **Merge date**: 2026-03-26
- **Branch cleanup**: done
- **Summary**: Device health tracking with consecutive failure detection (3 strikes → unreachable notification). Manual and notification-driven deactivation skips devices in scene execution, All Off, Nighttime. Fix Kasa offline detection (is_online never cleared). LIFX health checks via connected field. Auto-suggestion notification when deactivated devices come back online. Full UI treatment across DevicesPage (filter tab, dimmed cards), DeviceDetailPage/LightDetailPage (deactivation banner, disabled controls, reactivate button), RoomDetailPage (dimmed listings), SceneEditorPage (warning banner), AttentionBar (deactivate/reactivate action buttons). StatusBadge component. WCAG AA compliant dimmed colors.
- **Files**: 19 files changed (+1,285/-125) — device-health-service.ts (new), db/index.ts, scene-executor.ts, kasa-poller.ts, history-collector.ts, notification-service.ts, insights-engine.ts, system.ts, hubitat.ts, kasa.ts, lifx.ts, api.ts, Badge.tsx, AttentionBar.tsx, DevicesPage.tsx, DeviceDetailPage.tsx, LightDetailPage.tsx, RoomDetailPage.tsx, SceneEditorPage.tsx

## PR #37 — Fix deactivate button WCAG AA contrast
- **Branch**: fix/deactivate-button-contrast → dev
- **Created**: 2026-03-26
- **Status**: merged
- **Merge date**: 2026-03-26
- **Branch cleanup**: done
- **Summary**: Fixed deactivate button contrast to use theme-aware CSS variables for WCAG AA compliance
- **Files**: `client/src/pages/DeviceDetailPage.tsx`, `client/src/pages/LightDetailPage.tsx`

## PR #38 — Fix remaining audit issues and decompose SettingsPage
- **Branch**: fix/remaining-audit-issues → dev
- **Created**: 2026-03-26
- **Status**: merged
- **Merge date**: 2026-03-26
- **Branch cleanup**: done
- **Summary**: Webhook token from header not query param, 3 error message leaks fixed, 5 dead migration functions removed, deploy set -e for local shell, socket HMR dispose hook, SettingsPage decomposed from 2173 to 536 lines (7 extracted components)
- **Files**: `server/src/index.ts`, `server/src/routes/kasa.ts`, `server/src/routes/lifx.ts`, `server/src/db/index.ts`, `deploy-to-pi.sh`, `server/.env.example`, `client/src/hooks/useSocket.ts`, `client/src/pages/SettingsPage.tsx`, `client/src/components/settings/*` (7 new files)

## PR #39 — Add Sonos integration: follow-me music and auto-play rules
- **Branch**: feature/sonos-integration → dev
- **Created**: 2026-03-26
- **Status**: merged
- **Merge date**: 2026-03-26
- **Branch cleanup**: done
- **Summary**: Follow-me music (motion-driven speaker grouping), auto-play rules (favourites on mode change), line-in detection, locked state integration. Backend: sonos-client, sonos-manager, sonos routes, DB schema, motion/scheduler hooks. Frontend: SonosSetupPage, SonosDetailPage, MusicSection settings, Sonos tab on Devices, per-room controls on RoomDetail. PM2 + deploy config. Bug fixes: motion hook placement, webhook auth query param, auto-play validation.
- **Files**: 25 files changed (+3,205/-14)

## PR #40 — Fix follow-me auto-start UX and add inline auto-play rules
- **Branch**: fix/sonos-follow-me-autostart → dev
- **Created**: 2026-03-26
- **Status**: merged
- **Merge date**: 2026-03-26
- **Branch cleanup**: done
- **Summary**: Follow-me no longer auto-starts music (only moves already-playing). Removed default favourite, auto-start toggles, room favourite dropdowns. Added __continue__ auto-play option. Inline auto-play rule creator on SonosDetailPage and RoomDetailPage with read-only room field. Condition fieldset hidden for __continue__. Source value validation for if_source_not.
- **Files**: `server/src/lib/sonos-manager.ts`, `client/src/components/settings/MusicSection.tsx`, `client/src/pages/SonosDetailPage.tsx`, `client/src/pages/RoomDetailPage.tsx`

## PR #41 — Add Sonos volume control, mute all, and content type browser
- **Branch**: feature/sonos-volume-mute-content-browser → dev
- **Created**: 2026-03-26
- **Status**: merged
- **Merge date**: 2026-03-26
- **Branch cleanup**: done
- **Summary**: Live volume slider + mute toggle on speaker detail page (300ms debounce, auto-unmute). Mute all speakers button on homepage (groupMute/groupUnmute, optimistic UI). Two-step content type browser for auto-play favourites (URI-prefix classification, shared FavouriteSelector component).
- **Files**: `server/src/lib/sonos-client.ts`, `server/src/routes/sonos.ts`, `client/src/lib/api.ts`, `client/src/components/sonos/FavouriteSelector.tsx` (new), `client/src/pages/SonosDetailPage.tsx`, `client/src/pages/HomePage.tsx`, `client/src/pages/RoomDetailPage.tsx`, `client/src/components/settings/MusicSection.tsx`

## PR #42 — Improve mobile nav touch targets, move Settings to header
- **Branch**: fix/mobile-nav-touch-targets → dev
- **Created**: 2026-03-27
- **Status**: merged
- **Merge date**: 2026-03-27
- **Branch cleanup**: done
- **Summary**: Moved Settings from bottom nav to header gear icon (mobile only). Removed theme toggle. Increased touch targets (56→60px, 5 items). Added safe-area-inset-bottom for iPhone. Fixed text clipping on descenders.
- **Files**: `client/index.html`, `client/src/components/layout/AppLayout.tsx`

## PR #43 — Fix card text layout — give text full width
- **Branch**: fix/card-text-layout → dev
- **Created**: 2026-03-27
- **Status**: merged
- **Merge date**: 2026-03-27
- **Branch cleanup**: done
- **Summary**: SensorCard, KasaDeviceCard, and AttentionBar ItemCard restructured from single-row to two-row layouts so text gets full width and metadata/actions wrap below
- **Files**: `client/src/pages/DevicesPage.tsx`, `client/src/components/dashboard/AttentionBar.tsx`

## PR #54 — Homepage progressive disclosure: accordion subway + pill modes
- **Branch**: feature/homepage-progressive-disclosure → dev
- **Created**: 2026-03-27
- **Status**: merged
- **Merge date**: 2026-03-27
- **Branch cleanup**: done
- **Summary**: MTA subway card wrapped in collapsible accordion. Mode selector converted to horizontal scroll pills.
- **Files**: `client/src/pages/HomePage.tsx`

## PRs #55-58 — Individual workstream PRs (superseded by #59)
- **Status**: closed

## PR #59 — Energy cost intelligence, visual indicators, Sonos-Kasa linking
- **Branch**: review/all-workstreams → dev
- **Created**: 2026-03-27
- **Status**: merged
- **Merge date**: 2026-03-27
- **Branch cleanup**: done
- **Summary**: WS1-WS4 consolidated. Backend energy cost from Kasa hardware memory. Homepage visual indicators (lux icons, temp colours, footprints). Contextualised cost on room detail and insights. Sonos-Kasa device linking with cost attribution. Kasa device detail cost headline.
- **Files**: 15 files changed (+1,879 lines) — insights-engine.ts, dashboard.ts, device-links.ts (new), db/index.ts, index.ts, sonos.ts, api.ts, utils.ts, HomePage.tsx, EnergyCard.tsx, RoomIntelligence.tsx, SonosDetailPage.tsx, DeviceDetailPage.tsx, SonosSetupPage.tsx
