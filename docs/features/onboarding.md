# `onboarding`

**Purpose:** the first run, as a wizard. One upload is described by the AI,
becomes the user's first workspace with the AI columns the user chose, and
the last step runs those columns and marks the user as onboarded.

**Contract:** `apps/api/src/__tests__/onboarding.api.test.ts` — the payloads,
the responses and the error codes live in its header. Do not duplicate them
here.

## Table

This feature has no table of its own. It writes `User.onboardingCompleted`
([user.md](user.md)), one `Workspace` plus its `Spreadsheet` with its
`description` and `purpose` ([workspace.md](workspace.md),
[spreadsheet.md](spreadsheet.md)), that sheet's `Column`/`Row`/`Cell` grid and
the extra columns, and — at the end — one run-ai batch ([run-ai.md](run-ai.md)).

Migrations: `apps/api/prisma/migrations/20260925120000_add_user_onboarding_completed/`,
`apps/api/prisma/migrations/20261019120000_add_spreadsheet_description_purpose/`.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/src/modules/onboarding/onboarding.schema.ts` | schema | `onboardingInput` (`name?`, `description?`, `purpose?`, `columns?` as JSON text → `columnDraftInput[]`), `onboardingResultSchema`, `onboardingDescriptionSchema` + its strict twin `describedSheetSchema`, `suggestColumnsInput`, `suggestedColumnSchema`, `onboardingSuggestionsSchema`, `finishOnboardingInput`, `onboardingFinishSchema`, the caps (`ONBOARDING_MAX_COLUMNS` 10, `ONBOARDING_SAMPLE_ROWS` 5, `MAX_SUGGESTED_COLUMNS` 5, `ONBOARDING_AI_COLUMN_TYPES`), `workspaceNameFromFile` |
| `apps/api/src/modules/onboarding/onboarding.errors.ts` | errors | `OnboardingAlreadyCompletedError`, `OnboardingAiUnavailableError` (503), `OnboardingAiFailedError` (502) |
| `apps/api/src/modules/onboarding/onboarding.service.ts` | service | the REST half (imports the parsers, never enters the tRPC graph): `describe` (parse → one model call, writes nothing), `create` (guard → parse → workspace → grid → columns → meta, rollback on failure, no flag) |
| `apps/api/src/modules/onboarding/onboarding-wizard.service.ts` | service | the tRPC half, parser-free and prisma-free: `suggestColumns` (one model call → strict per-item parse → taken names dropped → cap 5), `finish` (runnable columns × first rows → one `runCells` batch → the flag), `rowBudget` |
| `apps/api/src/ai/onboarding-prompt.ts` | pure | `buildDescribePrompt`, `buildSuggestColumnsPrompt` (rules + the untrusted `<file>`, `<sheet-description>`, `<columns>`, `<sample-rows>` blocks, over the assistant prompt's `describeColumns` / `describeRows` / `describeSheet`), `toSampleRows`, `ONBOARDING_UNTRUSTED_RULE` |
| `apps/api/src/ai/onboarding-ai.ts` | model | `generateSheetDescription`, `generateColumnSuggestions` — one `generateText` + `Output.object` each over a deliberately lenient schema; `DescribeGenerator` / `SuggestGenerator` (the injectable types) |
| `apps/api/src/modules/onboarding/onboarding.controller.ts` | REST | `POST /onboarding/describe` (multipart `file`), `POST /onboarding` (multipart `file` + `name`, `description`, `purpose`, `columns`) |
| `apps/api/src/modules/onboarding/onboarding.module.ts` | Nest | registers the controller in `app.module.ts` |
| `apps/api/src/trpc/routers/onboarding.ts` | router | `suggestColumns`, `finish` |
| `apps/api/prisma/reset.ts` | script | `db:reset`: empties every table, creates one user who has not onboarded |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `POST /onboarding/describe` | REST | `OnboardingService.describe` | 400, `SPREADSHEET_IMPORT_*`, `ONBOARDING_AI_UNAVAILABLE`, `ONBOARDING_AI_FAILED` |
| `POST /onboarding` | REST | `OnboardingService.create` | 400, `VALIDATION_FAILED`, `SPREADSHEET_IMPORT_*`, `SPREADSHEET_COLUMN_NAME_TAKEN`, `ONBOARDING_ALREADY_COMPLETED` |
| `onboarding.suggestColumns` | mutation | `OnboardingWizardService.suggestColumns` | `ONBOARDING_AI_UNAVAILABLE`, `ONBOARDING_AI_FAILED`, validation |
| `onboarding.finish` | mutation | `OnboardingWizardService.finish` | `WORKSPACE_NOT_FOUND`, `SPREADSHEET_NOT_FOUND`, `ONBOARDING_ALREADY_COMPLETED`, `RUN_AI_DISPATCH_FAILED`, validation |

The upload routes are REST only: multipart does not ride the tRPC link, and
the CSV/XLSX parsers must stay out of the `src/trpc/**` graph the dashboard
transpiles — which is why the feature has two services. Clients read the flag
through `user.me`.

## Behaviour

- **Two model calls, in the wizard's order.** `describe` runs on the upload
  (so the user sees and edits the description before anything else);
  `suggestColumns` runs on the user's final name, description and purpose
  plus the parse summary `describe` returned (columns and five sample rows),
  so the file is uploaded once and the second call carries no parser.
- **The generators are lenient, the services strict.** Each call is
  `generateText` + `Output.object` over a schema with no caps, enums or
  patterns (Gemini drops them from a response schema). The answer is then
  parsed with the strict twin — `describedSheetSchema` whole, or
  `suggestedColumnSchema` per proposal — so a bad proposal costs one column
  and an unusable description is `ONBOARDING_AI_FAILED`.
- **A proposal is dropped, never fatal,** when it fails the strict parse,
  repeats a name (a file column's or an earlier proposal's, trimmed and
  case-insensitive — the sheet's own rule) or lands past the cap of 5; each
  counts in `skipped`. No usable column means `needsMoreContext: true`
  whatever the model said, and `question` is only ever set then.
- **`create` writes in this order, so a bad request leaves nothing:**
  1. 409 if the user has already onboarded (`userService.me()`).
  2. `spreadsheetImportService.parse` (inference, limits, codes as the import).
  3. `workspaceService.create` (workspace + sheet in one transaction).
  4. `spreadsheetImportService.replaceAll` (the grid).
  5. `spreadsheetColumnsService.createColumn` per draft, in order (each
     takes the next `sortOrder`; a taken name is the columns service's 409).
  6. `spreadsheetService.updateMeta` (description, purpose).
  A failure after step 3 deletes the new workspace with
  `prisma.workspace.delete` (the FK cascade takes the sheet). Not
  `workspaceService.remove`: its last-workspace guard would refuse exactly
  this delete. **`create` does not set the flag.**
- **`finish` is the only writer of the flag.** It filters the sheet's columns
  with the run-ai service's `isRunnable`, reads the first stored rows with
  `readAllRows` up to `rowBudget(rowLimit, columns)` — `rowLimit` (default
  and at most 1000) capped by floor(5000 / columns) so one batch fits the
  run-ai cell cap — and creates one `runCells` batch, then
  `userService.completeOnboarding`. No runnable column or no row: no batch,
  the flag is still set. A dispatch failure propagates with the flag still
  false, so the step is retried from the client. Larger sheets finish
  partially filled; the sheet page runs the rest.
- **The gate is the flag.** A reload between `create` and `finish` keeps the
  user on `/onboarding`; the page resumes at the cards step from
  `workspace.list` ([route doc](../routes/onboarding.md)).
- **`db:reset`** (`apps/api/prisma/reset.ts`) deletes every row of every
  table, children first (`RunAi` has no foreign key), then creates "Demo
  User" with `onboardingCompleted: false` and no workspace. It refuses
  `NODE_ENV=production`. The seed (`prisma/seed.ts`) is unchanged and still
  creates an onboarded user with the "Customers" workspace.

## Reusable pieces

- `OnboardingService.describe(bytes, filename, mimeType, { generate })` and
  `OnboardingWizardService.suggestColumns(input, { generate })` — the
  model-free paths for any caller that wants the parse summary or the
  contract's filtering over its own proposals (a scripted setup, a test).
- `SpreadsheetImportService.parse` validates a file before any write. Use it
  for any future "create X from a file" flow.
- `columnDraftInput` ([spreadsheet.md](spreadsheet.md)) — "a column without
  its sheet" for any feature that takes a list of columns to create.
- The test helpers `csvBody` and `xlsxBody` live in
  `src/__tests__/support/upload.ts`.

## Used by

- `/onboarding` ([route doc](../routes/onboarding.md)) calls
  `POST /onboarding/describe`, `onboarding.suggestColumns`, `POST /onboarding`
  and `onboarding.finish`, in that order; the cards step in between is
  `assistant.recommendWidgets` + `dashboard.replace`
  ([assistant.md](assistant.md), [dashboard.md](dashboard.md)).
