# Architectural Decisions

> Log architectural and technical decisions here during work sessions.
> Format: date, decision, rationale, alternatives considered.

---

## 2026-03-23 — Dashboard and historical data architecture
- New dedicated Insights page (not on homepage) for device data, energy, battery, environment
- Homepage stays focused on scene control and subway — dashboard data is separate
- Chart.js + react-chartjs-2 for visualizations (180KB, cached by PWA service worker)
- Historical data stored indefinitely at 10-minute resolution — no retention limits
- User manages data deletion via Settings (clear all, by age, by source)
- device_history table with composite index on (source, source_id, recorded_at)
- Aggregate dashboard endpoint reduces N API calls to 1
- Socket.io used for real-time cache invalidation (not data transport)
- Rationale: Pi has ample disk for years of data (~100MB/year), SQLite handles millions of rows

## 2026-03-22 — Adopted Coding Fairy template
- Migrated project to use the Coding Fairy agent orchestration template
- Moved E2E tests from `client/e2e/` to `.testing/tests/`
- Moved Playwright config from `client/playwright.config.ts` to `.testing/playwright.config.ts`
- Created `.specs/PROJECT_SPEC.md` from existing CLAUDE.md content
- Rationale: Standardised agent workflow, better test organisation, spec-first protocol
