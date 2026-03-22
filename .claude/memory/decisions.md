# Architectural Decisions

> Log architectural and technical decisions here during work sessions.
> Format: date, decision, rationale, alternatives considered.

---

## 2026-03-22 — Adopted Coding Fairy template
- Migrated project to use the Coding Fairy agent orchestration template
- Moved E2E tests from `client/e2e/` to `.testing/tests/`
- Moved Playwright config from `client/playwright.config.ts` to `.testing/playwright.config.ts`
- Created `.specs/PROJECT_SPEC.md` from existing CLAUDE.md content
- Rationale: Standardised agent workflow, better test organisation, spec-first protocol
