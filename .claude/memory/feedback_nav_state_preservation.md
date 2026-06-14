---
name: Navigation state preservation is critical
description: Back navigation must restore scroll, filters, search, accordion state — not just scroll position
type: feedback
---

When users navigate to a detail page and press Back, they expect to return to EXACTLY where they were — same filters, same search text, same accordion open/closed state, same scroll position. This is a critical design decision.

**Why:** The user explicitly flagged this as critical UX. Losing filter/accordion state on back navigation feels broken and forces users to redo their work.

**How to apply:** Use `usePersistedState` hook (in `client/src/hooks/usePersistedState.ts`) instead of `useState` for any page-level UI state that should survive navigation. The hook uses sessionStorage with POP navigation detection. Apply to any new list/filter pages.
