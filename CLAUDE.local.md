<!--
  CLAUDE.local.md — repo-specific overrides and notes for home-fairy.
  Claude Code reads this alongside the canonical CLAUDE.md.

  Use this file ONLY for things that are genuinely unique to this codebase and
  don't fit into:
    - .specs/PROJECT_SPEC.md    (stack, commands, allow-list, icon library)
    - .specs/personas.md        (who this product is for)
    - .specs/DESIGN_LANGUAGE.md (visual tokens)
    - .specs/features.md        (user-facing feature log)

  If you find yourself adding a rule here that would apply to any Code Fairy-
  managed repo, raise it — it belongs in canonical, not local.
-->

# home-fairy — local overrides

## User Environment

The user works on a **Mac in Safari**. This is true for Coding Fairy itself
and for every repo managed by Coding Fairy.

- **Keyboard shortcuts**: prefer macOS conventions; when the user specifies
  `Ctrl+Enter`, honour it literally (they use it in Safari).
- **Browser behaviour**: verify against Safari/WebKit — do not rely on
  Chrome-only APIs, and account for WebKit quirks around focus, paste/clipboard,
  autofocus, and form submission.
- **Testing**: when running Playwright or manual browser checks, Safari/WebKit
  is the primary target; Chromium is secondary.
