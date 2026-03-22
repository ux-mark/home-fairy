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
