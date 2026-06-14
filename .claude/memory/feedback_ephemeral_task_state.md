---
name: Ephemeral task-oriented state
description: Inline expand/collapse interactions (like sub-space pills) should use plain useState, not usePersistedState — they reset on navigation
type: feedback
---

Inline expand/collapse interactions that are task-oriented (e.g. expanding a child room's content on the homepage) should use plain `useState`, NOT `usePersistedState`.

**Why:** These are momentary task actions — the user opens a sub-space, does something, navigates away. When they come back, they want a clean slate, not leftover clutter from the previous task.

**How to apply:** When deciding between `useState` and `usePersistedState`, ask: is this a persistent preference (like which accordion sections are open, filter settings) or a task-in-progress action (like expanding inline content)? Persistent preferences get `usePersistedState`. Task actions get plain `useState`. This is an exception to the general nav state preservation rule.
