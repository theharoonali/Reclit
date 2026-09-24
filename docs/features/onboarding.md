# `onboarding`

**Purpose:** the first run. One upload (CSV or `.xlsx`) becomes the user's
first workspace, with the file's contents as its sheet, and marks the user as
onboarded.

**Contract:** `apps/api/src/__tests__/onboarding.api.test.ts` — the payload,
the response and the error codes live in its header. Do not duplicate them
here.

## Table

This feature has no table of its own. It writes `User.onboardingCompleted`
([user.md](user.md)), one `Workspace` plus its `Spreadsheet`
([workspace.md](workspace.md)), and that sheet's `Column`/`Row`/`Cell` grid
([spreadsheet.md](spreadsheet.md)).

Migration: `apps/api/prisma/migrations/20260925120000_add_user_onboarding_completed/`.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/src/modules/onboarding/onboarding.schema.ts` | schema | `onboardingInput` (optional `name`; blank counts as absent), `onboardingResultSchema`, `workspaceNameFromFile` |
| `apps/api/src/modules/onboarding/onboarding.errors.ts` | errors | `OnboardingAlreadyCompletedError` |
| `apps/api/src/modules/onboarding/onboarding.service.ts` | service | `complete`: guard → parse → create workspace → write grid → set flag |
| `apps/api/src/modules/onboarding/onboarding.controller.ts` | REST | `POST /onboarding` (multipart `file` + `name`) |
| `apps/api/src/modules/onboarding/onboarding.module.ts` | Nest | registers the controller in `app.module.ts` |

## Procedures

None over tRPC. The feature exposes REST `POST /onboarding` only, because
multipart does not ride the tRPC link and the CSV/XLSX parsers must stay out
of the `src/trpc/**` graph that the dashboard transpiles. Clients read the
flag through `user.me`.

## Behaviour

- `complete` runs its steps in this order, so a bad file writes nothing:
  1. It checks the flag with `userService.me()` and throws a 409 if the user
     has already onboarded.
  2. It calls `spreadsheetImportService.parse`, which reads the file, infers
     column types and checks the limits without touching the database.
  3. It calls `workspaceService.create`, which creates the workspace and its
     sheet in one transaction.
  4. It calls `spreadsheetImportService.replaceAll`, which writes the grid in
     a second transaction.
  5. It calls `userService.completeOnboarding`.
- If step 4 fails, the service deletes the new workspace with
  `prisma.workspace.delete`, and the FK cascade removes the sheet with it. It
  cannot use `workspaceService.remove`: the last-workspace guard would refuse
  that delete for a user whose only workspace this is.
- Workspace ownership comes from `workspaceService.create`, which sets the
  owner to `userService.me()`. The onboarding service never sets `ownerId`
  itself.
- The import logic is shared with `POST /spreadsheets/:id/import`: both call
  `SpreadsheetImportService.parse`, so the inference, the limits and the error
  codes are identical.

## Reusable pieces

- `SpreadsheetImportService.parse` validates a file before any write. Use it
  for any future "create X from a file" flow.
- The test helpers `csvBody` and `xlsxBody` live in
  `src/__tests__/support/upload.ts`.

## Used by

- `/onboarding` ([route doc](../routes/onboarding.md)) calls `POST /onboarding`.
