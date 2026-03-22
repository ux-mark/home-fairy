# Changelog

> Log completed work here during sessions.
> Format: date, what was done, files affected.

---

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
