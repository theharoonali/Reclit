# `workspace`

**Purpose:** workspaces group spreadsheets; creating one allots it a same-named
spreadsheet, and renaming keeps the two names in step.

**Contract:** `apps/api/src/__tests__/workspace.api.test.ts` — payloads,
responses, and error codes live in its header. Do not duplicate them here.

## Table `Workspace`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `name` | `String` | required, 1..200 trimmed |
| `ownerId` | `String` | fk cascade → `User`, indexed |
| `createdAt` | `DateTime` | `@default(now())`, indexed |
| `updatedAt` | `DateTime` | `@updatedAt` |

Indexes: `ownerId`, `createdAt` · Relations: `owner User`,
`spreadsheets Spreadsheet[]` (cascade on workspace delete; `Spreadsheet` gained
required `workspaceId`) · Migrations:
`apps/api/prisma/migrations/20260831000000_add_user_workspace/` — backfills a
default user and one workspace per pre-existing sheet.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `Workspace` + `Spreadsheet.workspaceId` |
| `apps/api/src/modules/workspace/workspace.schema.ts` | schema | zod inputs + `WorkspaceSummary` |
| `apps/api/src/modules/workspace/workspace.errors.ts` | errors | `WorkspaceNotFoundError`, `LastWorkspaceError` |
| `apps/api/src/modules/workspace/workspace.service.ts` | service | `list`, `byId`, `create`, `rename`, `remove` |
| `apps/api/src/trpc/routers/workspace.ts` | router | thin delegation |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `workspace.list` | query | `WorkspaceService.list` | — |
| `workspace.byId` | query | `WorkspaceService.byId` | `WORKSPACE_NOT_FOUND` |
| `workspace.create` | mutation | `WorkspaceService.create` | validation (`USER_NOT_FOUND` only on a never-seeded DB) |
| `workspace.rename` | mutation | `WorkspaceService.rename` | `WORKSPACE_NOT_FOUND`, validation |
| `workspace.remove` | mutation | `WorkspaceService.remove` | `WORKSPACE_NOT_FOUND`, `WORKSPACE_LAST` |

## Behaviour

- The schema is one-to-many (`spreadsheets Spreadsheet[]`) for future scope;
  the app creates exactly one sheet per workspace today. `WorkspaceSummary`
  exposes the derived `spreadsheetId` (first sheet by `createdAt`, nullable
  when `spreadsheet.remove` orphaned the workspace).
- `create` resolves the owner via `userService.me()` and writes workspace +
  sheet in one transaction; the sheet gets `DEFAULT_TOTAL_ROWS` from
  `spreadsheet.schema.ts`. `rename` updates workspace and sheets in one
  transaction. Sheets are written through `tx.spreadsheet` directly so the two
  services stay dependency-free of each other.
- `remove` refuses to delete the owner's last workspace (`conflict`); the fk
  cascade otherwise deletes the sheets and their columns/rows/cells.
- `list` is ordered `createdAt asc` — stable menu order.

## Reusable pieces

- `LastWorkspaceError`'s "an owner keeps at least one" pattern for any future
  can't-delete-the-last rule.
- Test fixtures for sheet-hosting suites:
  `apps/api/src/__tests__/support/fixtures.ts`.

## Used by

- Sidebar account menu (every `(app)` route,
  `components/workspace/account-menu.tsx`) — `workspace.list`,
  `workspace.create`.
- `/ai-spreadsheet` ([route doc](../routes/ai-spreadsheet.md)) — reads the
  active workspace's `spreadsheetId` via `workspace.list`.
- `workspace.rename` / `workspace.remove` currently have no UI surface — the
  settings workspace section was removed; the procedures and contract remain.
