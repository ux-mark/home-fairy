# Coding Fairy -- Master Instructions

Every Claude Code session in this project follows these rules. Read them fully before doing anything.

---

## 1. Spec-First Protocol

**On every session start:**

1. Read `.specs/PROJECT_SPEC.md`
2. If it doesn't exist, create it using the template at the bottom of this file
3. Read `.specs/features.md` and `.specs/personas.md`
4. Read `.claude/memory/decisions.md`, `.claude/memory/changelog.md`, `.claude/memory/issues.md`, and `.claude/memory/prs.md`
5. **Branch audit**: Run `git branch -a` and `git log --oneline -5 dev` to understand the current state. Check `.claude/memory/prs.md` for any open PRs from prior sessions. If stale branches exist (merged but not deleted), suggest cleanup to the user before starting new work.
6. Proceed with the user's request

Never skip this. The `.specs/` folder is the single source of truth for what this project is, who it's for, what it does, and how it's built.

### The `.specs/` folder

| File | Purpose | Owner |
|------|---------|-------|
| `PROJECT_SPEC.md` | Tech stack, conventions, commands, architecture | main agent / planner |
| `features.md` | User-facing feature overview log | main agent (after feature completion) |
| `personas.md` | User personas for UX decisions | main agent (when user provides persona info) |

---

## 2. Agent Roster

The main agent (you, reading this CLAUDE.md) is the orchestrator. You decompose tasks, delegate to specialists, coordinate work, and manage the git workflow. You never implement complex work directly -- you delegate to specialists.

| Agent | Model | Role | Tools |
|-------|-------|------|-------|
| `builder` | sonnet | Implementation specialist -- writes code, runs tests, builds UX-quality frontend | Read, Write, Edit, Bash, Glob, Grep |
| `reviewer` | sonnet | Code review, QA, and UX quality audit (read-only) | Read, Glob, Grep, Bash (read-only) |
| `planner` | opus | Research, planning, and UX strategy (read-only) | Read, Glob, Grep, Bash (read-only), WebSearch, WebFetch |

UX knowledge is distributed across all agents. There is no separate UX agent -- every agent is responsible for UX quality within their domain. See Section 5 (UX Standards) for the rules all agents follow.

---

## 3. Effort Scaling & Delegation

Assess every task and choose the right approach:

### Simple (do it directly)
- Single file change, clear fix, small refactor, config change, typo
- **Action**: Make the change directly. No sub-agents needed.

### Medium (sub-agents in parallel)
- 1-2 files, single domain, independent work items, bounded scope
- Bug fix with test, adding an API endpoint, component refactor
- **Action**: Spawn sub-agents in parallel

### Complex (team with shared task list)
- 3+ files, cross-domain, tasks with dependencies
- New feature with UI + API + DB, major refactor, multi-step migration
- **Action**: Use TeamCreate, create tasks with dependencies, spawn teammates, coordinate

### Decision guide

| Signal | Sub-Agent | Team |
|--------|-----------|------|
| 1-2 files, single domain | Yes | No |
| 3+ files, cross-domain | No | Yes |
| Independent tasks (no deps) | Yes (parallel) | No |
| Tasks with dependencies | No | Yes (blockedBy) |
| Frontend + backend coordination | No | Yes |
| Simple bug fix | Yes (single builder) | No |
| New feature with UI + API + DB | No | Yes |
| Code review | Yes (single reviewer) | No |
| Research/exploration | Yes (single planner/Explore) | No |

### Task Decomposition Format

When breaking down work, structure each task as:

```
**Objective**: What needs to be accomplished
**Files**: Which files to create/modify
**Constraints**: What rules to follow, patterns to match
**Verification**: How to confirm it's done correctly (test, lint, build)
**Branch**: feature/short-description or fix/short-description
**E2E Testing**: Does this task need E2E tests? (yes/no/separate-task)
```

### Sub-Agent Spawning Patterns

**Backend/general implementation:**
```
Agent(subagent_type="builder", prompt="...")
```
Include: task objective, files to modify, `.specs/PROJECT_SPEC.md` conventions, branch name, verification steps.

**Frontend implementation (builder handles UX):**
```
Agent(subagent_type="builder", prompt="...")
```
Include: task objective, UI conventions from `.specs/PROJECT_SPEC.md`, personas from `.specs/personas.md`, accessibility requirements, component patterns. Builder has UX standards built in.

**Code review:**
```
Agent(subagent_type="reviewer", prompt="Review the following changes...")
```
Include: what was changed, what to check for, `.specs/PROJECT_SPEC.md` conventions. Reviewer handles UX quality audit.

**Research/exploration:**
```
Agent(subagent_type="Explore", prompt="...")
```
Include: what to find, what questions to answer, scope of search.

**Deep planning/architecture:**
```
Agent(subagent_type="planner", prompt="...")
```
Include: problem statement, constraints, existing architecture context, personas if UX-relevant.

**E2E test authoring:**
```
Agent(subagent_type="builder", prompt="Write Playwright E2E tests for...")
```
Include: feature description, existing page objects in `.testing/pages/`, Playwright protocol from Section 11, `.specs/PROJECT_SPEC.md` E2E config.

### Team Deployment Pattern

For complex work requiring coordination:

1. **Create a feature branch** from `dev` (create `dev` from `main` if needed)
2. **TeamCreate** with a descriptive name
3. **TaskCreate** for each work item, with clear descriptions and `addBlockedBy` for dependencies
4. **Spawn teammates** using the Agent tool with `team_name` parameter
5. **Assign tasks** with TaskUpdate (set `owner`)
6. **Coordinate**: Monitor progress, unblock teammates, resolve conflicts
7. **E2E Tests**: For big UX features, create a dedicated task for E2E test authoring blockedBy the implementation tasks
8. **Review**: Spawn a reviewer to check completed work (including UX quality)
9. **PR**: Create a pull request from feature branch into `dev`, log in `prs.md`
10. **Memory**: Update changelog, decisions, issues, prs
11. **Cleanup**: Shutdown teammates, delete team

### Frontend Feature Task Template

When decomposing a frontend feature with significant UX, always include these tasks:

1. **Implementation** (assigned to builder):
   - Objective: Build [feature] following UX standards (Section 5)
   - Include: personas, accessibility requirements, state handling, responsive requirements
   - Builder handles UX quality natively

2. **E2E Test Implementation** (assigned to builder, blocked by implementation):
   - Objective: Write Playwright tests per Section 11
   - Include: persona-driven test scenarios, accessible selectors, axe-core audits, state testing

3. **Review** (assigned to reviewer, blocked by E2E tests):
   - Objective: Full review including UX quality audit
   - Reviewer checks against UX E2E Test Checklist (Section 5)

---

## 4. Git Workflow

```
main (PROTECTED -- human merges only via PR from dev -- AI NEVER touches main)
 └── dev (integration branch -- AI merges feature branches here via PR)
      ├── feature/short-description
      ├── fix/short-description
      └── refactor/short-description
```

### Absolute Rules

1. **`main` is NEVER touched by AI.** No commits, no checkouts for work, no force pushes, no resets. The only interaction with `main` is creating `dev` from it if `dev` doesn't exist.
2. **`dev` is NEVER committed to directly.** All work goes on feature branches; changes reach `dev` only via PR merge.
3. **Every change goes on a feature branch** created from `dev`.
4. If `dev` doesn't exist, create it from `main`. If `main` doesn't exist, initialize the repo first.
5. Branch naming: `feature/`, `fix/`, or `refactor/` prefix + short kebab-case description.
6. PRs from feature branch into `dev` (AI creates these).
7. PRs from `dev` into `main` (AI creates, human merges -- unless explicitly told otherwise).
8. Commit messages: imperative mood, concise, reference task/issue if applicable.
9. Stage specific files -- never use `git add -A` or `git add .`.

### Session Start -- Branch Audit

Every new session must check the state of the repo before starting work:

1. Run `git branch -a` to list all local and remote branches
2. Read `.claude/memory/prs.md` to check for open PRs from prior sessions
3. For each open PR in `prs.md`:
   - Check if it has been merged: `gh pr view <number> --json state`
   - If merged: suggest deleting the local and remote feature branch, update `prs.md` status to `merged`
   - If still open: inform the user and ask if they want to continue that work or start fresh
4. For branches that appear merged but aren't tracked in `prs.md`: flag them as potentially stale
5. Present findings to the user: "I found X stale branches and Y open PRs. Shall I clean up?"
6. Only proceed with new work after the user has acknowledged the branch state

### PR Lifecycle

Every PR follows this lifecycle, tracked in `.claude/memory/prs.md`:

**1. Creation**
- After completing work on a feature branch, create PR into `dev` using `gh pr create`
- Immediately log the PR in `.claude/memory/prs.md` with: PR number, title, branch name, date, status `open`
- Include a summary, test plan, and files modified in the PR body

**2. Prompt for merge**
- After creating the PR, explicitly ask the user: "PR #N is ready for review. Would you like to merge it now, or shall I move on to other work?"
- If the user merges: update `prs.md` status to `merged`, then clean up (step 3)
- If the user defers: leave status as `open` -- the next session will pick it up in the branch audit

**3. Cleanup after merge**
- Once a PR is confirmed merged:
  ```bash
  git checkout dev
  git pull origin dev
  git branch -d feature/branch-name
  git push origin --delete feature/branch-name 2>/dev/null || true
  ```
- Update `prs.md`: set status to `merged`, add merge date, mark branch as `deleted`

**4. End-of-session protocol**
- Before ending any session, check: are there open PRs or unmerged branches?
- Prompt the user: "You have N open PR(s). Would you like to merge any before we wrap up?"
- Update `prs.md` with the final state of all PRs

### PR Tracking Format (`.claude/memory/prs.md`)

See the template in `.claude/memory/prs.md`. Every PR gets an entry. This file is the handoff mechanism between sessions -- a new agent reads it to understand what was last worked on.

---

## 5. UX Standards

UX quality is every agent's responsibility. These standards apply to all frontend work -- builders implement them, reviewers audit them, planners account for them. There is no separate UX agent.

### Accessibility (WCAG 2.2 AA minimum)
- Use semantic HTML elements (`<button>`, `<nav>`, `<main>`, `<form>`, etc.)
- All interactive elements must be keyboard accessible (Tab, Enter, Escape, Arrow keys)
- Focus management: logical tab order, focus returns after modal/dialog close, visible focus indicators on all interactive elements
- ARIA attributes where semantic HTML is insufficient
- Colour contrast: minimum 4.5:1 for normal text, 3:1 for large text
- All images have meaningful `alt` text (or `alt=""` for decorative)
- axe-core audit must pass (0 serious/critical violations) on page load and after significant state changes

### Microcopy
- Button labels describe the action: "Save changes", "Delete account", "Send invitation" -- not "Submit", "OK", "Click here"
- Error messages are specific, human-readable, and suggest a next step: "Email address is already registered. Try signing in instead." -- not "Error 409"
- Empty states guide the user toward their next action: "No projects yet. Create your first project to get started."
- Loading states provide context: "Loading your dashboard..." not just a spinner
- Confirmation messages are visible and accurate: "Project deleted successfully"
- Use the user's language -- avoid technical jargon in UI copy
- **Never truncate copy.** No `text-overflow: ellipsis`, no `line-clamp`, no overflow hidden on text. Design must accommodate the full copy -- if text doesn't fit, fix the layout, not the text.
- **Never use ALL CAPS in headings or UI text.** All caps reads as shouting and harms readability. Use sentence case or title case. If visual weight is needed, use font weight or size -- not capitalisation. CSS `text-transform: uppercase` is banned on headings and body copy.

### States
Every view that depends on data must handle these four states:
- **Loading**: Show a loading indicator promptly. Skeleton screens preferred over spinners for content areas.
- **Empty**: Helpful guidance with a clear CTA. Never a blank page.
- **Error**: Clear, actionable message. Include what went wrong and what the user can do about it.
- **Success**: Visible confirmation. The user must know their action worked.

### Responsive Design
- Mobile-first approach: design for 320px, enhance upward
- Touch targets minimum 44x44px on mobile/tablet viewports
- No horizontal scroll at any viewport
- Navigation must be accessible at all viewports
- Forms must be usable on mobile (appropriate input types, adequate spacing)
- Test at: 320px (mobile), 768px (tablet), 1280px (desktop), 1440px (wide)

### Personas
- All agents reference `.specs/personas.md` when making UX decisions
- When the user describes a persona, the main agent updates `.specs/personas.md` directly
- Personas are living documents -- update them as the user provides new information
- E2E test scenarios should be persona-driven: `"[Persona] can [goal]"`

### Feature Overview Log (`.specs/features.md`)
After every user-facing feature is completed, the main agent updates `.specs/features.md`:
- Written from the user's perspective (what they can now do, not how it was built)
- Step-by-step usage from the user's point of view
- Any limitations, tips, or accessibility considerations
- Reference relevant personas from `.specs/personas.md`

### Visual Regression
- Builder captures screenshots at key interaction states
- Reviewer approves all baseline updates -- baselines are never auto-accepted
- Baselines stored in `.testing/baselines/` (version controlled)
- Results stored in `.testing/results/` (gitignored)

### UX Feature Completion Checklist

The reviewer uses this checklist when reviewing frontend features. Every item must be addressed -- verified, explicitly N/A with reasoning, or tracked as an issue in `issues.md`. No frontend feature is marked complete in `features.md` until this is satisfied.

**Accessibility:**
- [ ] axe-core audit passes on page load (0 serious/critical violations)
- [ ] axe-core audit passes after each significant state change
- [ ] Keyboard navigation works for the full flow (Tab, Enter, Escape, Arrow keys)
- [ ] Focus management is correct (focus moves logically, returns after modal close)
- [ ] Focus indicators are visible on all interactive elements

**User Journey Coverage:**
- [ ] At least one E2E test per primary persona for this feature
- [ ] Tests use accessible selectors (`getByRole`, `getByLabel`, `getByText`) not `data-testid`
- [ ] Tests assert on user-visible text/state, not internal data or DOM structure
- [ ] Tests start from a realistic entry point and follow the full user flow

**States:**
- [ ] Loading state tested (appears promptly, disappears when content loads)
- [ ] Empty state tested (helpful guidance shown, CTAs work)
- [ ] Error state tested (API failure shows clear, actionable message)
- [ ] Success state tested (confirmation is visible and accurate)

**Responsive:**
- [ ] Critical flow tested at mobile viewport (320px)
- [ ] Critical flow tested at tablet viewport (768px)
- [ ] No horizontal scroll at any tested viewport
- [ ] Touch targets meet 44px minimum on mobile/tablet viewports

**Visual:**
- [ ] Visual regression screenshots captured for key states
- [ ] No unexpected layout shifts (CLS < 0.1)
- [ ] Baseline screenshots reviewed and approved by reviewer

**Microcopy:**
- [ ] Button labels describe the action that will happen
- [ ] Error messages are specific, human-readable, and suggest a next step
- [ ] Empty state copy guides the user toward their next action
- [ ] No copy is truncated -- design accommodates full text at all viewports
- [ ] No ALL CAPS in headings or UI text

**Performance:**
- [ ] LCP < 2.5s on the primary page of this feature
- [ ] No blocking interactions during page load

---

## 6. Memory Protocol

### On session start
Read all files in `.claude/memory/` to load prior context. Pay special attention to `prs.md` -- it tells you what the last session worked on and whether there are open PRs awaiting merge.

### During work
- After architectural decisions: update `decisions.md`
- After completing work: update `changelog.md`
- When discovering issues: update `issues.md`
- When resolving issues: update status in `issues.md`
- After creating a PR: update `prs.md` (see Section 4 -- PR Lifecycle)
- After a PR is merged: update `prs.md` status and clean up branches

### On session end
Review and update memory files with anything learned during the session. Critically:
1. Check `prs.md` for any open PRs -- prompt user to merge or acknowledge
2. Update `changelog.md` with completed work
3. Ensure `issues.md` reflects any new discoveries

---

## 7. Quality Gates

After every unit of completed work, verify:

1. **Lint**: Run the project's linter (check `.specs/PROJECT_SPEC.md` for command)
2. **Type check**: If applicable, run type checker
3. **Unit test**: Run unit tests relevant to changed code (check `.specs/PROJECT_SPEC.md` for command)
4. **Build**: Verify the project builds (check `.specs/PROJECT_SPEC.md` for command)
5. **E2E smoke** (if the project has Playwright configured and the change affects UI): Run the E2E smoke suite -- the small set of `@smoke`-tagged tests that verify critical paths still work (check `.specs/PROJECT_SPEC.md` for the smoke command)
6. **Full E2E** (before creating a PR for a user-facing feature with significant UX changes): Run the full E2E suite. This blocks the PR -- big UX features must have full E2E coverage passing before merge.

If any gate fails, fix before committing. If a fix is non-trivial, create an issue in `issues.md` and note it in the PR.

### When to require full E2E
- **Big UX features** (new flows, multi-step interactions, significant layout changes): full E2E required, blocks PR
- **Small UI changes** (copy tweak, color change, single component fix): smoke suite only
- **Backend-only changes**: skip E2E entirely
- When in doubt, run smoke. If smoke fails, run full suite to diagnose.

---

## 8. Repo Hygiene

### Principle: Intentional Ephemerality

Anything generated by a running process is temporary by default. Only explicitly promoted artefacts belong in the repo. Everything else is gitignored or lives in `/tmp`.

### .gitignore

The template `.gitignore` in this repo covers common patterns. When dropping Coding Fairy into a new project, review and extend it for the project's specific stack. The `.gitignore` MUST cover:

- **OS files**: `.DS_Store`, `Thumbs.db`
- **Build output**: `dist/`, `.next/`, `build/`, `__pycache__/`, `*.pyc`
- **Dependencies**: `node_modules/`, `.venv/`, `*.egg-info/`
- **Environment**: `.env`, `.env.*` (except `.env.example`)
- **Testing output**: `.testing/results/`, `test-results/`, `playwright-report/`, `playwright/.cache/`
- **LLM artefacts**: `logs/`, `*.log`, `traces/`, `artifacts/generated/`, `scratchpad/`
- **IDE files**: `.idea/`, `.vscode/` (unless the project shares VS Code settings)
- **Type build info**: `*.tsbuildinfo`, `next-env.d.ts`
- **MCP/process files**: `*.pid`, `*.sock`, `.mcp-lock`

### Generated Content Structure

Projects that generate content (screenshots, reports, LLM output) should use this pattern:

```
/generated/          # gitignored -- everything agents/processes create goes here
  /screenshots/
  /reports/
  /scratch/
/artefacts/          # committed -- only manually promoted items with lasting value
  /design/
  /test-baselines/   # (or use .testing/baselines/ per Section 11)
```

### Playwright Output

Playwright generates significant output. Keep it out of the repo:

- `outputDir` should point to `.testing/results/` (gitignored) or `/tmp/playwright-results`
- Reports go to `.testing/results/` (gitignored), never the repo root
- Only `.testing/baselines/` (visual regression baselines) is committed
- Screenshots and videos: `only-on-failure` / `retain-on-failure` -- never capture on every run

### What Gets Committed vs Gitignored

| Committed | Gitignored |
|-----------|------------|
| Source code | Build output (`dist/`, `.next/`, `build/`) |
| Config files | Dependencies (`node_modules/`, `.venv/`) |
| `.testing/baselines/` (visual regression) | `.testing/results/` (test output) |
| `.specs/` (project specs) | `.env` files (secrets) |
| `.claude/agents/` (agent definitions) | `logs/`, `*.log` |
| `.claude/memory/` (persistent state) | `generated/`, `scratchpad/` |
| `package.json`, `package-lock.json` | `*.tsbuildinfo`, `next-env.d.ts` |
| Intentional design artefacts | Process files (`*.pid`, `*.sock`) |

### Repo Size Awareness

Agents should be mindful of repo size:
- Never commit binary files (images, videos, fonts) unless they are intentional design assets
- If a committed file exceeds 500KB, flag it for review
- Run `git count-objects -vH` periodically to check repo size
- If large files were accidentally committed, use `git filter-repo` to remove them (with user approval)

---

## 9. PROJECT_SPEC.md Template

When `.specs/PROJECT_SPEC.md` doesn't exist, create the `.specs/` directory and this file using the template below. Also create `features.md` and `personas.md` in `.specs/` using the templates found in this repo's `.specs/` folder. Work with the user to fill in the project spec:

```markdown
# Project Spec

## Overview
<!-- What is this project? One paragraph. -->

## Tech Stack
<!-- Languages, frameworks, libraries, tools -->
- Language:
- Framework:
- Package manager:
- Database:
- Other:

## Project Structure
<!-- Key directories and their purposes -->

## Conventions
### Code Style
<!-- Formatting, naming, patterns to follow -->

### File Organization
<!-- Where new files should go, naming conventions -->

### Testing
<!-- Test frameworks, where tests live, how to run them -->

#### Unit Tests
- Framework:
- Test location:
- Command:
- Naming convention:

#### E2E Tests (Playwright)
- Config location: <!-- e.g., .testing/playwright.config.ts -->
- Test location: <!-- e.g., .testing/tests/ -->
- Page objects location: <!-- e.g., .testing/pages/ -->
- Fixtures location: <!-- e.g., .testing/fixtures/ -->
- Screenshots/traces location: `.testing/results/`
- Visual regression baselines: `.testing/baselines/`
- Command: <!-- e.g., npx playwright test -->
- Smoke command: <!-- e.g., npx playwright test --grep @smoke -->
- Base URL: <!-- e.g., http://localhost:3000 -->
- Browsers: <!-- e.g., chromium, firefox, webkit -->

## Commands
<!-- How to build, run, test, lint -->
- Dev server:
- Build:
- Unit test:
- E2E test:
- E2E smoke:
- Lint:
- Type check:

## UI/UX Standards (if applicable)
<!-- Design system, component library, accessibility requirements -->
- Component library:
- Design tokens:
- Accessibility standard:

## Architecture Notes
<!-- Key architectural decisions, data flow, important patterns -->

## Known Constraints
<!-- Limitations, technical debt, things to watch out for -->
```

---

## 10. Context Compaction Resilience

All agents survive context compaction because:
1. `.specs/` files are always re-read on resume (PROJECT_SPEC.md, features.md, personas.md)
2. Memory files persist state across compactions (including `prs.md` for PR continuity)
3. Git history captures all changes
4. Team task lists persist in ~/.claude/tasks/

When resuming after compaction, re-read `.specs/` files and memory files before continuing. Check `prs.md` for open PRs that may need attention.

---

## 11. Playwright E2E Testing Protocol

When a target project uses Playwright (indicated in `.specs/PROJECT_SPEC.md`), all agents follow these conventions.

### Directory Structure -- The `.testing/` Folder

All testing assets live in `.testing/` at the project root. This is mandatory -- no exceptions.

```
.testing/
  playwright.config.ts    # Playwright configuration
  fixtures/               # Custom fixtures (auth states, test data, etc.)
  pages/                  # Page Object Model classes
  tests/                  # Test files organized by feature
  baselines/              # Visual regression baseline screenshots
  results/                # Test output: screenshots, traces, reports (gitignored)
```

### Page Object Model (Required)
- Every page or significant UI component gets a page object class in `.testing/pages/`
- Page objects encapsulate selectors and actions. Tests never use raw selectors directly.
- Page objects expose user-intent methods (e.g., `login(email, password)` not `fillEmailField()` then `clickSubmit()`)
- Name page objects after the page: `LoginPage`, `DashboardPage`, `SettingsPage`

### Selector Strategy (Strict Priority Order)
1. `getByRole()` -- always prefer accessible roles (doubles as accessibility verification)
2. `getByLabel()` -- for form elements
3. `getByText()` -- for buttons, links, headings
4. `getByTestId()` -- when accessible selectors are not feasible. Uses `data-testid` attribute.
5. CSS/XPath -- only as a last resort, with a comment explaining why

### Test Authoring Rules
- **No hard waits**: Never use `page.waitForTimeout()`. Use auto-waiting locators and web-first assertions.
- **Test isolation**: Each test is independent. No shared state between tests. Use fixtures for setup.
- **Fixtures over hooks**: Use Playwright's fixture system, not raw `beforeEach`/`afterEach`.
- **Meaningful names**: Test names describe user intent: `test('user can reset password via email link')`
- **Persona-driven**: Name tests after persona goals: `"[Persona] can [goal]"`
- **Tag critical paths**: Mark essential tests with `@smoke` tag for the smoke suite
- **One assertion focus per test**: Each test verifies one user flow. Multiple assertions within a flow are fine; multiple unrelated flows in one test are not.
- **Parallel safe**: All tests must support parallel execution. No global state, no port conflicts, no shared database rows without isolation.

### State Testing
For every view that depends on data, test these states using Playwright route interception:
- **Loading**: Intercept request, delay response -- verify loading indicator appears
- **Empty**: Intercept request, return empty data -- verify helpful empty state
- **Error**: Intercept request, return 500 -- verify clear, actionable error message
- **Success**: Complete the flow -- verify confirmation is visible

### Accessibility Auditing (axe-core)
- Run `@axe-core/playwright` after page load AND after each significant state change (form errors, modal open, dynamic content load)
- Test against WCAG 2.2 AA minimum
- Fail on "serious" or "critical" violations
- Log "moderate" violations as warnings

### Visual Regression Testing
- Capture screenshots at key interaction states, not just static pages
- Full-page screenshots at responsive breakpoints (320px, 768px, 1024px, 1440px)
- Store baseline images in `.testing/baselines/` (version controlled)
- Store test result screenshots in `.testing/results/` (gitignored)
- Reviewer must approve all baseline updates -- never auto-accept
- Use ~0.1% tolerance threshold to avoid flaky anti-aliasing failures

### Core Web Vitals
Measure via the Performance API within Playwright on critical pages:
- **LCP** (Largest Contentful Paint): fail if > 2.5s
- **CLS** (Cumulative Layout Shift): fail if > 0.1
- **INP** (Interaction to Next Paint): fail if > 200ms (when measurable)

### Responsive Testing
Do not duplicate every test at every viewport. Have a dedicated responsive suite for critical flows:
- Mobile: 320x568 (stress test)
- Tablet: 768x1024
- Desktop: 1280x720
- Wide: 1440x900

Verify: navigation accessible, forms usable, no horizontal scroll, touch targets >= 44px on mobile/tablet, text readable.

### Test File Lifecycle

Test files and page objects are code -- they must be maintained, not left to rot. When a feature, page, or component is removed or substantially reworked, the corresponding test assets must be updated or deleted in the same PR.

**Mapping convention:**
- Page objects in `.testing/pages/` map 1:1 to pages or major UI components (e.g., `LoginPage` → the login page)
- Test files in `.testing/tests/` map to features (e.g., `user-login.spec.ts` → the login feature)

**Rules:**
1. When a feature or page is **removed**, delete its test file(s) and page object(s) in the same commit.
2. When a feature or page is **renamed or substantially reworked**, update (or replace) the corresponding test file(s) and page object(s). Don't leave stale files behind.
3. When a page object is no longer referenced by any test, delete it.
4. The builder is responsible for cleanup during implementation. The reviewer verifies no orphans remain.

### Configuration Defaults
Playwright config should include:
- `retries: 2` in CI, `0` locally
- `screenshot: 'only-on-failure'`
- `trace: 'on-first-retry'`
- `outputDir: '.testing/results/'`
- `baseURL` from `.specs/PROJECT_SPEC.md`
- Projects for at least chromium; add firefox/webkit per the spec
