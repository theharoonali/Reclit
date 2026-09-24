# `populate`

**Purpose:** fill a sheet from outside the grid — the public form and the REST
"Populate API" are the same two operations: read a sheet's fillable fields,
and submit one row by column name. A submission also starts the sheet's AI
columns for the new row.

**Contract:** `apps/api/src/__tests__/populate.api.test.ts` — payloads,
responses, and error codes live in its header. Do not duplicate them here.

## Table

None. Populate owns no data: the row is written by the `spreadsheet` feature
and the runs by `run-ai`.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/src/modules/populate/populate.schema.ts` | schema | `populateFormSchema`, `populateSubmitInput`, `populateSubmissionSchema`, `MAX_POPULATE_FIELDS` |
| `apps/api/src/modules/populate/populate.errors.ts` | errors | `PopulateUnknownFieldError`, `PopulateFieldNotFillableError` |
| `apps/api/src/modules/populate/populate.service.ts` | service | `form()`, `submit()`; pure `isFillable`, `fillableByName`, `resolveCells` |
| `apps/api/src/trpc/routers/populate.ts` | router | `populate.form`, `populate.submit` |
| `apps/api/src/modules/populate/populate.controller.ts` | controller | `GET /populate/:id`, `POST /populate/:id` — the Populate API |
| `apps/api/src/modules/populate/populate.module.ts` | module | registers the controller |

## Procedures

| Procedure | REST twin | Service method | Errors |
| --- | --- | --- | --- |
| `populate.form` | `GET /populate/:id` | `PopulateService.form` | not found |
| `populate.submit` | `POST /populate/:id` (201) | `PopulateService.submit` | not found, bad request |

## Behaviour

- `submit` is `byId` → `columnsOf` → `resolveCells` →
  `spreadsheetCellsService.appendRow` → `runAiBatchService.runRow`. Type
  checking, the sparse-row rule and the append index race all stay in
  `appendRow`; populate never touches prisma.
- **Fillable** = not a formula and no `node`. One predicate (`isFillable`)
  decides both what `form` lists and what `submit` accepts.
- Column names are unique for every column created since plan 026, but
  nothing in the database enforces it and older sheets may hold duplicates.
  `fillableByName` gives a name
  to the first fillable column in display order; a later duplicate cannot be
  addressed. `resolveCells` collects every unknown / computed name before it
  throws, so one response names them all.
- **After `appendRow` returns, nothing may throw.** `triggerRuns` catches
  everything `runRow` can raise — `RUN_AI_DISPATCH_FAILED`, and
  `RUN_AI_CELL_BUSY` when a deleted last row's index is reused while its runs
  are still working — and reports it as `runError`. A failed request would
  invite a retry, and a retry would append the row twice.
- Dependency direction: populate → run-ai → spreadsheet. Neither of those
  features knows populate exists.

## Reusable pieces

- `runAiBatchService.runRow(id, rowIndex)` — "run this row's AI columns", for
  any future writer that should trigger them (an import, a webhook).
- `common/rest.ts` `withParams` — body + route params for `schema.parse`,
  shared with the spreadsheet controller.

## Used by

- `/form/[spreadsheetId]` ([route doc](../routes/form.md)) — `form` on load,
  `submit` on submit.
- `/populate` ([route doc](../routes/populate.md)) — `form`, to build the curl
  example of the API card.
- External callers — the REST twins.
