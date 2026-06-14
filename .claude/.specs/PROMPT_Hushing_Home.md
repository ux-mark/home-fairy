## Task: Rework Hushing Home to match original spec — single scene + room locking

You are working in the home-fairy repo at /home/queen/home-fairy.

Read CLAUDE.md, .specs/PROJECT_SPEC.md, and .specs/features.md before starting. Follow all Coding Fairy conventions (branch from dev, feature branch, PR into dev, update memory files).

### Background

"Hushing Home" (previously called "Hush Home", and before that "Manual mode") is a feature that lets the user quiet the whole house with one tap. It was recently renamed to "Hushing Home" in a merged PR — use that name consistently everywhere: UI labels, code comments, log messages, API docs, socket events, DB keys, and variable/function names. Anywhere you see "Hush Home", "hush", or "manual" in the context of this feature, update it to "Hushing Home" / "hushing" as appropriate (e.g. `hush_active` → `hushing_active`, `hush_scene` → `hushing_scene`, `HushQuickAction` → `HushingQuickAction`, `HushModeSection` → `HushingHomeSection`, API routes `/system/hush/*` → `/system/hushing/*`, socket events `hush_activate` → `hushing_activate`, etc.). The user-facing label is "Hushing Home". The status when active is "Home is Hushing".

### What needs to change

The current implementation has two problems that diverge from the original spec:

#### 1. Single scene, not per-room scenes

**Current (wrong):** Each room has its own `hush_scene` column and the settings UI shows a per-room scene dropdown. The user must configure a scene for every room individually.

**Required:** The user selects ONE scene for the entire house. When Hushing Home is activated, that single scene is activated globally. The database should store one `hushing_scene` value in the `current_state` table (not a column per room). The settings UI should show a single scene picker — a dropdown of all available scenes. The homepage Hushing Home button should work the same way (single global toggle), but if no scene is configured yet, tapping it navigates to settings to pick one.

Remove the `hush_scene` column from the rooms table (write a migration that drops it). Remove per-room scene selection from the settings UI. Remove the per-room activate/deactivate endpoints (`POST /hush/:roomName/activate` and `POST /hush/:roomName/deactivate`).

#### 2. Lock all rooms like Night modes do

**Current (wrong):** Hushing Home only sets a `hushing_active` flag in `current_state` and the motion handler checks that flag to skip auto scene activation. It does NOT lock rooms through the existing `motionHandler.lockRooms()` system that Nighttime and Guest Night use.

**Required:** When Hushing Home is activated, it must call `motionHandler.lockRooms()` with ALL room names (no exclusions — every room gets locked). This is the same mechanism Nighttime uses at `server/src/routes/system.ts` around line 1449 and Guest Night around line 1502. When Hushing Home is deactivated, it must call `motionHandler.unlockAllRooms()`. This means:
- The lock icon on room cards will appear for all rooms (existing UI, already works with locked rooms)
- The "Unlock all rooms" button on the homepage will work for Hushing Home (same as it does for Night modes)
- The `/night/status` endpoint will correctly report rooms as locked
- `sonosManager.onLockedStateActivated()` should be called on activation (same as Night modes)

The separate `hushing_active` flag in `current_state` should remain, because the motion handler uses it and it distinguishes "locked because Hushing Home" from "locked because Night mode". But the room locking must happen through the proper `motionHandler` system on top of that.

### Files to examine and modify

- `server/src/routes/system.ts` — Hushing Home endpoints (rename routes, add lockRooms/unlockAllRooms calls, remove per-room endpoints, change scene storage to current_state)
- `server/src/db/index.ts` — migration to drop `hush_scene` column from rooms, add `hushing_scene` to current_state
- `server/src/lib/motion-handler.ts` — rename `hush_active` references to `hushing_active`
- `client/src/components/settings/HushModeSection.tsx` — rewrite as `HushingHomeSection.tsx`: single scene picker instead of per-room dropdowns
- `client/src/pages/HomePage.tsx` — rename HushQuickAction → HushingQuickAction, update labels to "Hushing Home" / "Home is Hushing", update API call references
- `client/src/lib/api.ts` — rename types, methods, and endpoints (HushStatus → HushingStatus, activateHush → activateHushing, etc., route paths `/hush/` → `/hushing/`)
- `client/src/lib/homepage-sections.ts` — rename section key if needed
- `client/src/pages/SettingsPage.tsx` — update import to HushingHomeSection
- `server/src/routes/rooms.ts` — remove hush_scene from room update handler
- `.specs/features.md` — update the feature description to reflect the new behaviour

### Verification

1. TypeScript compiles cleanly (client and server)
2. Activating Hushing Home activates the single configured scene AND locks all rooms
3. Deactivating Hushing Home unlocks all rooms
4. Motion handler skips scene activation when hushing is active
5. Settings shows a single scene picker, not per-room dropdowns
6. All UI strings say "Hushing Home" / "Home is Hushing"
7. No remaining references to "Hush Home", "hush_scene" (on rooms table), "Manual mode", or old route paths
