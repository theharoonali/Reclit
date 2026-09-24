# 025 — Public form redesign, submit-triggers-AI, and the Populate API

**Status:** implemented
**Scope:** full feature

## Goal

A visitor opening `/form/<spreadsheetId>` sees a modern form: a header carrying
the spreadsheet's name, fields two to a row with placeholders, and a file
selector that uploads on pick and deletes the upload on remove. Submitting adds
a row **and runs the sheet's AI columns for that row**. The same submit
operation is a documented REST API, shown on `/populate` in place of the
"Coming soon" card with a ready-to-copy curl.

## Backend (Agent 1)

- **Table(s):** none. No sharing model is added — the API stays authless.
- **Procedures** (new feature `populate`):
  - `populate.form` · query · `{ id }` → `{ spreadsheet: {id,name}, fields: {name,type,columnIndex}[] }` · `NOT_FOUND`
  - `populate.submit` · mutation · `{ id; fields: Record<columnName, CellValue> }` → `{ row, runs, runError }` · `NOT_FOUND`, `BAD_REQUEST`
  - REST twins: `GET /populate/:id` (200), `POST /populate/:id` (201).
  - `DELETE /files` · body `{ url }` → `{ url, removed }` · 400 `FILE_URL_NOT_DELETABLE`, 502 `FILE_DELETE_FAILED`, 503.
- **Service methods:**
  - `populateService.form(id)` — the sheet's fillable columns (not formula, no node), first column per name.
  - `populateService.submit(input)` — names → column indexes, `appendRow`, then `runAiBatchService.runRow`.
  - `runAiBatchService.runRow(id, rowIndex)` — every runnable column of one row; `[]` when none.
  - `fileService.remove(url)` — deletes one `uploads/<uuid>/<name>` object.
- **Reused:** `spreadsheetCellsService.appendRow` (validation, index race),
  `runAiBatchService.runCells` (runs, waves, dispatch), `withParams` (moved to
  `common/rest.ts` at its second consumer).

## Frontend (Agent 2)

- **Route(s):** `/form/[spreadsheetId]` (unchanged: `(public)` group,
  force-dynamic, no prefetch) and `/populate`.
- **Components:** `components/public-form/` is split into `-panel`, `-header`,
  `public-form`, `-fields`, `-file-field`, `-success` and
  `use-public-form-uploads`; `components/populate/` gains
  `populate-api-card` and `use-copy`. `FormField` from `common/` replaces the
  hand-written label wrappers.
- **States:** loading / error / not-found / empty stay; the file field adds
  idle → uploading → uploaded | error. No new token.

## Integration (Agent 3)

- `PublicFormPanel` → `populate.form`; `PublicForm` → `populate.submit`;
  file field → `POST /files`, `DELETE /files`.
- `PopulateApiCard` → `populate.form` (to build the curl example).
- Nothing is invalidated: the form holds no list.

## Decisions

- Payload keyed by column **name**, not index — friendlier to API callers and
  stable across reorders. Index-keyed `cells` was rejected.
- Duplicate column names: the first in display order owns the name; later ones
  are absent from the form. A 400 for ambiguity was rejected — it would make
  such sheets impossible to submit to.
- A submission succeeds once the row is saved; any failure to start the AI runs
  is reported in `runError`. Failing the request was rejected — a retry would
  duplicate the row.
- Upload on pick + authless `DELETE /files` restricted to
  `uploads/<uuid>/<name>`. A signed delete token was rejected as heavier than
  the rest of the authless API warrants.
- Delete does not check whether a cell references the URL — that needs an
  unindexed JSON scan of `Cell`.
- Uploads of a form that is never submitted stay in storage (orphans).
- The draft is cleared when the submission succeeds, so no remove button can
  ever delete a file a saved row references.

## Risks / open questions

- `DELETE /files` lets anyone holding an upload URL delete it. The uuid path is
  the only mitigation until auth exists.
- The public write API has no rate limit.
- Browser callers on other origins are blocked by the CORS allowlist;
  server-to-server callers are not.
- The Supabase key may lack delete rights — then `removed` is `false`; the
  contract test asserts `true` right after an upload to catch it.

---

## Outcome

- **Shipped:**
  - Backend: `modules/populate/` (schema, errors, service, controller, module),
    `trpc/routers/populate.ts`, `RunAiBatchService.runRow`,
    `FileService.remove` + `uploadPathFromUrl` + `DELETE /files`,
    `common/rest.ts` (`withParams`, moved from the spreadsheet controller).
  - Frontend: `components/public-form/` split into `-panel`, `-header`,
    `public-form`, `-fields`, `-file-field`, `-success`,
    `use-public-form-uploads`; `components/populate/populate-api-card.tsx` +
    `use-copy.ts`; `lib/populate/curl-example.ts`, `lib/format-file-size.ts`,
    `lib/upload-file.ts` (moved out of `lib/ai-spreadsheet/`, gained
    `deleteFile` and `MAX_UPLOAD_BYTES`), `sendJson` in `lib/api-fetch.ts`.
  - Verified in the browser: header with the sheet name over a border, two
    fields per row from `md` and one below, placeholders, upload on pick
    (`POST /files` 201), remove → `DELETE /files` `removed: true` and the object
    gone from the bucket, inline validation, submit → row saved with the file
    URL and a `pending` run on the AI column; the `/populate` curl → 201.
- **Deviated:**
  - Replace deletes the old upload *before* uploading the new one (the plan
    said after). A failed replacement would otherwise leave the old file
    unreferenced in storage; the cost is that a failed replace loses the old
    file, which the visitor just chose to discard anyway.
  - The draft is not only cleared in `onSuccess`: the form unmounts when the
    success view shows, so no remove button can outlive a submission.
  - Leaf components call `useTranslations` themselves instead of receiving a
    `labels` prop — placeholders interpolate the column name per field.
  - `publicForm.errors.upload` became `publicForm.file.failed` / `tooLarge`
    (the error now lives in the file field), and `errors.json` had its ICU
    braces escaped — it was unformattable before.
- **Not done:** rate limiting and auth for the public write API and
  `DELETE /files`; collecting uploads orphaned by an abandoned form; a
  cell-reference check before delete; CORS for browser callers on other
  origins (`ALLOWED_API_ORIGINS` is global). A `runError` is not surfaced to
  the form's visitor — the row is saved and they cannot act on it.
- **Docs updated:** new `docs/features/populate.md` (+ index row);
  `docs/features/{file,run-ai,spreadsheet}.md`;
  `docs/routes/{form,populate,index,ai-spreadsheet}.md`; `docs/SECURITY.md`;
  `ARCHITECTURE.md`. Contracts: new `populate.api.test.ts`; `file.api.test.ts`
  (DELETE) and `run-ai.api.test.ts` (`runRow`) extended. Frontend tests:
  `tests/public-form/public-form.test.ts`, `tests/populate/curl-example.test.ts`.
