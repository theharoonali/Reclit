# 013 — Workspaces, default user, workspace menu, header title, settings page

**Status:** implemented
**Scope:** full feature

## Goal

The user can switch between workspaces from a menu at the bottom of the sidebar,
create a new workspace (which allots a same-named spreadsheet to it), see the
active workspace's name at the top of the header, and open a settings page that
edits their profile (name, picture) and manages workspaces (rename, delete).
`/ai-spreadsheet` shows the active workspace's sheet instead of the newest one.

## Backend (Agent 1)

- **Tables:**
  - `User` — `id uuid pk`, `name`, `imageUrl?`, timestamps; owns `workspaces`.
  - `Workspace` — `id uuid pk`, `name`, `ownerId → User (cascade)`, timestamps;
    `spreadsheets Spreadsheet[]` (one-to-many for future scope; the app creates
    exactly one per workspace today).
  - `Spreadsheet` — gains required `workspaceId → Workspace (cascade)`.
    Backfill migration: default user + one workspace per existing sheet.
- **Procedures:**
  - `user.me` (query) → UserProfile; NOT_FOUND when never seeded.
  - `user.update` (mutation, `{ name?; imageUrl?|null }`) → UserProfile.
  - `workspace.list` (query) → WorkspaceSummary[] (createdAt asc).
  - `workspace.byId` (query, `{ id }`) → WorkspaceSummary; NOT_FOUND.
  - `workspace.create` (mutation, `{ name }`) → WorkspaceSummary; creates the
    workspace **and** its same-named spreadsheet in one transaction.
  - `workspace.rename` (mutation, `{ id; name }`) → WorkspaceSummary; renames
    the workspace and its sheets in one transaction.
  - `workspace.remove` (mutation, `{ id }`) → `{ id }`; CONFLICT on the last
    workspace; cascade deletes the sheet.
  - `spreadsheet.create` gains required `workspaceId`.
- **Service methods:** `userService.me/update/create(seed only)`;
  `workspaceService.list/byId/create/rename/remove`. `WorkspaceSummary`
  carries a derived `spreadsheetId` (first sheet, nullable).
- Reused: `idInput` (common/schema), `mapDomainError`, `DomainError` kinds,
  `DEFAULT_TOTAL_ROWS` hoisted from the createSpreadsheetInput default.

## Frontend (Agent 2)

- **Routes:** `/settings` (`(app)` group, force-dynamic) + `settings` entry in
  `bottomNavItems`. No new route for switching — active workspace is
  client-side state persisted under localStorage `"reclit.activeWorkspaceId"`.
- **Components:**
  - New `@reclit/ui` primitives: `dialog`, `dropdown-menu`, `avatar`
    (radix deps added to packages/ui).
  - New `components/common/confirm-dialog.tsx`.
  - New `components/workspace/`: `workspace-provider` (+`useWorkspace()`),
    `workspace-menu` (replaces the static sidebar block),
    `create-workspace-dialog`, `workspace-header-title`.
  - New `components/settings/`: `profile-settings`, `workspace-settings`.
  - Extended: `header-actions.tsx` grows a second slot
    (`HeaderTitle`/`HeaderTitleOutlet`); `app-header.tsx` mounts the outlet in
    its left title area. `WORKSPACE` constant removed from `config/nav.ts`.
- **States:** LoadingState/ErrorState throughout; empty grid state mentions
  creating a workspace; last-workspace delete surfaced as an inline message.

## Integration (Agent 3)

- `workspace-provider` ← `workspace.list` (prefetched on `/ai-spreadsheet` and
  `/settings`).
- `ai-spreadsheet-loader` reads `activeWorkspace.spreadsheetId`; rows query
  keyed under `spreadsheet.rows` as before.
- `create-workspace-dialog` → `workspace.create`; invalidates `workspace.list`
  + `spreadsheet.list`; sets the new workspace active.
- `workspace-settings` → `workspace.rename` (invalidates `workspace.list`,
  `spreadsheet.list`, `spreadsheet.rows`) and `workspace.remove` (same).
- `profile-settings` → `user.me` / `user.update` (invalidates `user.me`).

## Decisions

- `Spreadsheet.workspaceId` required with a hand-edited backfill migration —
  rejected a nullable column (permanent null-handling, orphan sheets).
- Workspace→sheet is one-to-many in the schema, one-per-workspace in the app —
  rejected a unique FK, which the stated future scope would immediately break.
- Sheet name follows workspace name (create + rename) — the requirement says
  they are the same name.
- No auth: `user.me` = first user by createdAt; single seeded "Demo User".
- Active workspace in localStorage, URL unchanged — rejected
  `/ai-spreadsheet/[id]` routes as out of scope (user's choice).
- Sidebar imports `WorkspaceMenu` — documented deviation; the hard
  no-feature-import rule covers the header only, and a portal here would be
  over-engineering.
- REST `POST /spreadsheets` now requires `workspaceId` — breaking; accepted,
  no external consumers.

## Risks / open questions

- Backfill on DBs with several sheets makes one workspace per sheet; verify or
  `migrate reset` on throwaway dev DBs.
- `spreadsheet.remove` can orphan a workspace (`spreadsheetId: null`); the UI
  treats it as an empty workspace rather than forbidding it.
- Sidebar (and thus the menu + Settings) is hidden below `md` — pre-existing
  mobile-nav gap, unchanged here.

---

## Outcome

- **Shipped:** everything above. Backend: `User`/`Workspace` models +
  backfill migration (`20260831000000_add_user_workspace`), `user` and
  `workspace` modules with contract tests, `spreadsheet.create` requiring
  `workspaceId`, seed updated (default user + "Customers" via
  `workspace.create`). UI: `@reclit/ui` `dialog`/`dropdown-menu`/`avatar`;
  dashboard `components/workspace/*` (provider, menu, create dialog, header
  title), `components/settings/*`, `components/common/confirm-dialog.tsx`,
  header title slot in `header-actions.tsx`/`app-header.tsx`, `/settings`
  page, Settings bottom-nav entry.
- **Deviated:** the last-workspace guard counts the *owner's* workspaces, not
  all workspaces — same behaviour with one user, but deterministic to test
  (an isolated owner fixture) and correct if auth arrives. The backfill reuses
  each sheet's uuid as its workspace's id. `spreadsheet.create` maps the FK
  violation (P2003) rather than pre-checking. Seed passes explicit
  `node`/`prompt: null` to `createColumn` — it calls the service beneath the
  zod defaults (latent bug fixed in passing).
- **Not done:** more than one sheet per workspace in the app (schema allows
  it); mobile access to the menu/settings (sidebar hidden < md, pre-existing);
  auth.
- **Docs updated:** `docs/features/workspace.md`, `user.md`, `spreadsheet.md`;
  `docs/routes/settings.md`, `root.md` (also fixed the stale search-field
  claims), `ai-spreadsheet.md`; both indexes; contract headers of all three
  API test files.
