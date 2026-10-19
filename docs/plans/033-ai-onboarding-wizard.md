# 033 — AI onboarding wizard: describe, suggest AI columns, propose cards, run

**Status:** implemented
**Scope:** full feature

## Goal

A new user (no workspace, `onboardingCompleted` false) lands on a full-screen
two-column `/onboarding`. Left: the workspace name, the CSV/XLSX upload, a
description the AI writes from the file (editable) and "We see it as" — a short
label for what the sheet is. Right: the AI's steps and its proposals. After the
details, the AI proposes one to five AI columns (name, prompt, type) the user
edits, removes or adds to (AI or plain); if the data is unclear it asks for
more context and tries again. Confirming creates the workspace, imports the
grid and creates the columns. Then the AI proposes dashboard cards over every
column, the empty AI columns included, as editable config cards (type, x axis,
y formulas). "Run AI" saves the cards, runs the AI columns over the rows and
lands on `/`, where the cards fill as the runs complete. A `db:reset` script
wipes the database down to one bare user so the first visit is a first run.

Decided with the user: Run AI covers every row up to the batch caps (1000 rows,
5000 cells); the reset wipes everything, the seed stays; the workspace is
written when the columns are confirmed, so a reload resumes at the cards step;
the flag is set only by the final step.

## Backend (Agent 1)

- **Tables:** `Spreadsheet.description String?`, `Spreadsheet.purpose String?`
  (migration `20261019120000_add_spreadsheet_description_purpose`).
- **Procedures:**

  | Procedure | Kind | Payload | Response | Errors |
  | --- | --- | --- | --- | --- |
  | `POST /onboarding/describe` | REST multipart | `file` | `OnboardingDescription` | 400 import codes, 503 `ONBOARDING_AI_UNAVAILABLE`, 502 `ONBOARDING_AI_FAILED` |
  | `POST /onboarding` | REST multipart | `file`, `name?`, `description?`, `purpose?`, `columns?` (JSON, ≤ 10) | `OnboardingResult` (flag still false) | 400, 409 `SPREADSHEET_COLUMN_NAME_TAKEN`, 409 `ONBOARDING_ALREADY_COMPLETED` |
  | `onboarding.suggestColumns` | mutation | `{ name; description; purpose; columns; sampleRows }` | `OnboardingSuggestions` (≤ 5, `needsMoreContext`, `question`) | BAD_REQUEST, SERVICE_UNAVAILABLE, BAD_GATEWAY |
  | `onboarding.finish` | mutation | `{ workspaceId; rowLimit? }` | `OnboardingFinish` (flag true, `batchId`) | NOT_FOUND, CONFLICT, BAD_GATEWAY |

  Shapes live in the contract header of `onboarding.api.test.ts`.
- **Service methods:** `OnboardingService.describe` (parse → model, writes
  nothing) and `create` (guard → parse → workspace → grid → columns → meta,
  rollback on failure, no flag); `OnboardingWizardService.suggestColumns`
  (model → strict per-item parse, taken names dropped, cap 5) and `finish`
  (runnable columns × first rows within the caps → one `runCells` batch → flag).
  `SpreadsheetService.updateMeta`. The assistant's dashboard context lists
  empty AI columns as pending (role from type, the prompt shown) and carries
  the sheet description, so `recommendWidgets` charts them.
- **Reused:** `SpreadsheetImportService.parse` / `replaceAll`,
  `workspaceService.create`, `spreadsheetColumnsService.createColumn`,
  `runAiBatchService.runCells` + `isRunnable`, `readAllRows`,
  `userService.completeOnboarding`, the lenient-schema / strict-twin generator
  pattern of `assistant-recommend.ts`, `assistant.recommendWidgets`.
- **Reset:** `apps/api/prisma/reset.ts` (`db:reset`): every table emptied,
  one bare user created.

## Frontend (Agent 2)

- **Routes:** `/onboarding` keeps its `(onboarding)` group and gate; the page
  becomes `<OnboardingWizard />`, a full-bleed two-column grid.
- **Components (`components/onboarding/`):** `onboarding-wizard`,
  `onboarding-details-form`, `onboarding-ai-panel`, `onboarding-steps`,
  `onboarding-column-card` / `-list`, `onboarding-widget-card` / `-series` /
  `-list`; `dashboard-header-actions` gains the "AI is filling N cells…"
  line. Pure `lib/onboarding/{api,column-draft,widget-draft,steps}.ts`.
  `onboarding-upload`, `use-onboarding`, `complete-onboarding` are replaced.
- **States:** details idle / describing / described / AI unavailable (fields
  stay editable); columns thinking / list / tell-us-more / empty / creating;
  cards loading columns / thinking / list / empty / running; resume on reload.
  No live previews on the cards step (the AI columns are empty).

## Integration (Agent 3)

- Upload → `POST /onboarding/describe`; Continue → `onboarding.suggestColumns`;
  Create → `POST /onboarding` (stores the active workspace, invalidates
  `workspace.list`); cards → `assistant.recommendWidgets` (+ `spreadsheet.rows`
  limit 1 for the column meta); Run AI → `dashboard.replace` then
  `onboarding.finish` (invalidates `dashboard.byWorkspace`, `workspace.list`,
  `user.me`; the gate redirects). Resume: `workspace.list` non-empty → cards
  step. `/`: `runAi.listActive` + `runAi.onChange` invalidate the sheet rows as
  runs complete.

## Decisions

- The flag moves to `finish`: a wizard that creates the workspace early must
  not be redirected away by the gate; the resume path covers an abandoned run.
- Two model calls, not one: the description must be visible (and editable)
  before the columns are proposed, and the second call is a tRPC mutation over
  the parse summary so no file is re-uploaded and no parser enters `src/trpc`.
- `description` / `purpose` persist on `Spreadsheet` and feed the assistant's
  prompts, rather than living only in the wizard.
- Empty AI columns are described to the recommender as pending with a role
  derived from their type; the alternative (recommend after the run) would
  make the user wait minutes before seeing any card.
- Config cards instead of previews on the cards step: a preview over an
  empty column would show nothing and mislead.
- One `runCells` batch within the existing caps; larger sheets finish
  partially filled and the sheet page runs the rest.

## Risks / open questions

- Gemini drops schema constraints: the lenient / strict-twin split is kept.
- `workspace.list` is not owner-scoped; resume takes the first workspace
  (correct with the single user).
- Without the Trigger.dev worker the runs stay pending and the dashboard's
  "filling" line only clears on a refresh that finds nothing active.

---

## Outcome

- **Shipped (api):** `Spreadsheet.description` / `purpose` + the migration
  `20261019120000_add_spreadsheet_description_purpose`;
  `spreadsheetMetaSchema` widened, `columnDraftInput`,
  `updateSpreadsheetMetaInput`, `SpreadsheetService.updateMeta`;
  `isRunnable` exported from the run-ai batch service;
  `src/ai/assistant-prompt.ts` (`withPendingAiColumns`, `roleForType`,
  `PENDING_AI_COLUMN_RULE`, `describeSheet`, `<sheet-description>`,
  exported `describeColumns` / `describeRows`) and `assistant-context.ts`
  reading the sheet's meta and prompts; `src/ai/onboarding-prompt.ts`,
  `src/ai/onboarding-ai.ts`; `modules/onboarding/` — the schema (four
  shapes), two errors, `onboarding.service.ts` (`describe`, `create`),
  `onboarding-wizard.service.ts` (`suggestColumns`, `finish`, `rowBudget`),
  the controller's second route, `trpc/routers/onboarding.ts`;
  `prisma/reset.ts` + `db:reset`. Contracts: `onboarding.api.test.ts`
  (21 tests), `assistant.api.test.ts` (+2), `spreadsheet.api.test.ts`
  (meta) — all green, with `user`, `run-ai` and `dashboard` unchanged and
  green.
- **Shipped (dashboard):** `components/onboarding/` — the wizard, the
  details form and summary, the AI panel and steps, the column and widget
  cards and lists, six hooks (`use-onboarding-{wizard,describe,columns,
  create,widgets,finish}.ts`); `lib/onboarding/{api,column-draft,
  widget-draft,steps}.ts` with tests; `components/dashboard/
  use-dashboard-live-rows.ts` + the "AI is filling N cells…" line in the
  header actions; the `(onboarding)` layout and page; the `onboarding.*`
  and `dashboard.filling` messages. `onboarding-upload.tsx`,
  `use-onboarding.ts` and `lib/onboarding/complete-onboarding.ts` removed.
- **Verified:** lint, typecheck, every api contract (run one at a time
  against the remote database), the dashboard tests (235), the production
  dashboard build; in the browser after `db:reset`: `/` → `/onboarding`, a
  12-row hiring CSV described ("Hiring Pipeline", a two-sentence
  description, the name suggested), five AI columns proposed (a boolean red
  flag, a category, a summary…), one removed, Create workspace → six cards
  including a donut over the still-empty "Pipeline Status" AI column, a
  reload resuming at the cards step with a fresh proposal, `SUM({Nope})`
  and `SUM({Nope}` flagged on the card with Run AI disabled, then Run AI →
  `/` with the five cards and "AI is filling 48 cells…" beside Refresh,
  and `/onboarding` redirecting back to `/` once the flag is set.
- **Verified with the worker running** (2026-10-19, a second `db:reset`,
  `trigger:dev` started from the app's Terminal panel): a 12-row support
  ticket CSV described ("Support Tickets"), four AI columns proposed
  (category, boolean, 1–5 number, text), one removed, Create workspace →
  five cards (three stats, a bar over the still-empty "Issue Category" AI
  column, a bar of `AVG({Customer Sentiment})` by Plan), Run AI → `/` with
  "AI is filling 36 cells…" beside Refresh. The worker picked the batch up
  within ~10 s and ran the three column waves in ~45 s; the line counted
  36 → 27 → 14 → 4 and disappeared on `closed`, the category bar gained
  its bars, "Urgent Tickets" went 0 → 3 → 4 and "Average Customer
  Sentiment" appeared (2.5 → 2.8) with no Refresh press — one
  `runAi.onChange` request for the whole batch, one debounced
  `spreadsheet.rows` refetch per burst, no console or stream errors,
  `runAi.listActive` empty afterwards, `run-ai-batch` "Success" in the
  worker log, and `/ai-spreadsheet` showing every AI cell filled. Nothing
  needed fixing.
- **Deviated:** the UI was built straight against the API in one pass
  (no fixture stage: the API existed first); the describe step returns
  values as the import stores them (an ISO date, not the file's text);
  `rowBudget` is exported for its unit test; the cards step shows "over
  every row" on a resumed run, where the import's row count is unknown;
  `trpcCodeOf` lives in `lib/onboarding/api.ts` beside the key maps.
- **Not verified here:** the "tell us more" path with a real model
  refusal (covered by the contract with a fake generator), the no-key
  degraded path in the browser (contract only), and a batch with a failing
  cell (every cell of the live run succeeded, so the series-stopped path
  and how the dashboard line counts a failed run were not seen).
- **Not done:** editing a card's filters (the recommender's filters are
  kept as proposed, not shown); a row count on a resumed run; "suggest
  again" keeps only the user's own columns, not edits to the AI's.
- **Docs updated:** `docs/features/{onboarding,assistant,spreadsheet,
  run-ai,index}.md`, `docs/routes/{onboarding,root}.md`, `AGENTS.md`
  (`db:reset`), the contract headers of `onboarding`, `assistant` and
  `spreadsheet`.
- **Revised after the first review (same stream):** the wizard became four
  sliding screens (upload with the logo and one inline field; review; the
  columns as a divided read/edit list; the cards as a read/edit list showing
  title and subtitle, no formulas) with the AI orb large on the first screen
  and small beside a live checklist (`lib/onboarding/progress.ts`) after it,
  the page pinned to the viewport with per-column scrolling, less copy, small
  controls; the design tokens' grays went neutral and the preset gained the
  `slide-up` animation and the `orb-md` / `orb-lg` sizes; the dashboard's
  Refresh button was removed (the live stream also polls `runAi.listActive`
  while idle, so a batch started elsewhere is followed). Verified in the
  browser through the columns screen; with the Trigger worker running, two
  24-cell batches filled the dashboard live, the second without a reload.
