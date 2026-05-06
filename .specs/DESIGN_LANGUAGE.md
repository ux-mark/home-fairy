---
name: DESIGN_LANGUAGE
kind: reference
---

# Design Language

> The visual and interaction language for this repo. Per-repo — each product has its own. Fill this in with the user when they set up the repo; the uxicorn subagent can help shape it.

> Paired with `UX_STANDARDS.md` (canonical, shared across all repos). Standards = *"what must be correct?"*; this file = *"what must this product feel like?"* Enforcement of both lives in the UX feature-completion checklist in `UX_STANDARDS.md`.

> Reference: `/workspace/code-fairy/.specs/DESIGN_LANGUAGE.md` shows the structure filled in for Code Fairy itself. Copy the shape, not the values.

---

## North star

<!-- Three sentences max. What is the overall feel? What is it not? -->
<!-- Example: "Calm. Considered. A little bit magic. Not cute, not corporate, not busy." -->

---

## Mobile is the design target, not the downgrade

- Design every view at 320px first. Enhance upward.
- Touch targets are ≥44×44px.
- No hover-to-discover; no horizontal scroll; safe-area insets respected.

<!-- Add any product-specific mobile notes here. -->

---

## Tokens

All values live in CSS custom properties at `:root`. No hex codes or magic numbers inside component CSS.

### Colour (semantic roles)

<!-- Define the product's palette by role, not by name. Adjust hexes to taste;
     do not rename roles. Dark mode can land later as a token swap. -->

```css
--app-surface:        /* app background */ ;
--app-surface-raised: /* cards, modals */ ;
--app-surface-sunken: /* inputs, wells */ ;
--app-border:         ;
--app-border-strong:  ;
--app-text:           ;
--app-text-subtle:    ;
--app-text-faint:     ;
--app-accent:         /* primary brand colour */ ;
--app-accent-soft:    ;
--app-success:        ;
--app-warning:        ;
--app-danger:         ;
```

### Typography

<!-- Pick a typeface. Self-host it in the repo (e.g. in static/fonts/); do not
     load from a CDN. Declare @font-face once in the base stylesheet.
     Define the scale below. -->

```css
--app-font-body: /* e.g. 'Source Sans Pro', system-ui, sans-serif */ ;
--app-font-mono: ui-monospace, 'SF Mono', Menlo, Monaco, monospace;

--app-text-xs:  0.75rem;
--app-text-sm:  0.875rem;
--app-text-md:  1rem;
--app-text-lg:  1.125rem;
--app-text-xl:  1.375rem;
--app-text-2xl: 1.75rem;
--app-text-3xl: 2.25rem;

--app-weight-regular: 400;
--app-weight-semi:    600;
--app-weight-bold:    700;

--app-leading-tight: 1.25;
--app-leading-body:  1.5;
```

No `text-transform: uppercase`. No letter-spaced all-caps labels.

### Spacing

```css
--app-space-1: 0.25rem;
--app-space-2: 0.5rem;
--app-space-3: 0.75rem;
--app-space-4: 1rem;
--app-space-5: 1.5rem;
--app-space-6: 2rem;
--app-space-7: 3rem;
--app-space-8: 4rem;
```

### Radius

```css
--app-radius-sm:   6px;
--app-radius-md:   10px;
--app-radius-lg:   16px;
--app-radius-full: 9999px;
```

### Elevation

```css
--app-shadow-1:     /* soft */ ;
--app-shadow-2:     /* more soft */ ;
--app-shadow-focus: /* focus ring — must be visible */ ;
```

### Motion

```css
--app-duration-fast:   120ms;
--app-duration-medium: 200ms;
--app-duration-slow:   320ms;
--app-ease-standard:   cubic-bezier(0.2, 0, 0, 1);
--app-ease-emphasised: cubic-bezier(0.2, 0, 0, 1.2);
```

Respect `prefers-reduced-motion: reduce`.

---

## Primitives

<!-- List the primitive components this product uses. Each is one CSS class
     with documented variants. Build them first; compose views from them. -->

- Button (`.app-btn`) — variants, sizes, states
- Input / textarea / select
- Card
- List
- Modal / sheet (mobile bottom-sheet variant)
- Toast
- Empty state
- Skeleton
- …

---

## Layout

<!-- Describe the product's layout at each breakpoint. -->

- Mobile: …
- Tablet / desktop: …
- Widescreen: …

### Page shell

<!-- Top bar height, content region, nav pattern (bottom tab bar / sidebar / etc.) -->

---

## Icons

<!-- Name the icon library and any rendering conventions (size, stroke, colour). -->

- Library:
- Render size:
- Paired-with-text rule: see `UX_STANDARDS.md`.

---

## Voice

<!-- How does this product talk to the user? Sentence case? Warm? Clinical?
     Microcopy examples: success / error / empty states. -->
