# 034 — Public form output: visitors watch their row's AI columns fill in

**Status:** implemented
**Scope:** full feature

## Goal

An "Enable output" switch on `/populate`. When it is on for a sheet, the
public form page (`/form/<spreadsheetId>`) is two columns: the form on the
left and, on the right, beside the AI orb, the sheet's AI columns for the row
the visitor just submitted — each cell working, then its value, live, until
the row's runs are done. Off, the page is the single-column form it is today.

## Backend (Agent 1)

- **Table:** `Spreadsheet.formOutputEnabled Boolean @default(false)`
  (migration `20261020120000_add_spreadsheet_form_output`).
- **Procedures:**

  | Procedure | Kind | Payload | Response | Errors |
  | --- | --- | --- | --- | --- |
  | `populate.form` (+ `GET /populate/:id`) | query | `{ id }` | `PopulateForm` + `outputEnabled: boolean`, `outputs: { name; type; columnIndex }[]` (the runnable AI columns, display order, always listed) | NOT_FOUND |
  | `populate.setOutput` | mutation | `{ id; enabled }` | `PopulateForm` | NOT_FOUND |

- **Service methods:** `SpreadsheetService.setFormOutput(id, enabled)`;
  `PopulateService.form` lists the outputs from the same `columnsOf` walk;
  `PopulateService.setOutput` → `setFormOutput` then `form`.
- **Reused:** `isRunnable` (run-ai), `columnsOf`, `metaSelect` / `byId`,
  the populate contract's fixtures.

## Frontend (Agent 2)

- **Primitive:** `@reclit/ui/switch` (Radix switch; `switch` / `switch-thumb`
  size tokens), listed in FRONTEND.md.
- **`/populate`:** the form card gains the switch + one caption
  (`components/populate/populate-panel.tsx`, hook `use-form-output.ts`).
- **`/form/[spreadsheetId]`:** `public-form-panel.tsx` lays the form and
  `public-form-output.tsx` side by side when `outputEnabled` and the sheet has
  outputs; `use-public-form-output.ts` seeds from the submit response and
  follows `runAi.onChange` for the row; pure `lib/public-form-output.ts`
  (reducer, formatter) with tests.
- **States:** output column waiting / working / done / failed / skipped per
  cell; the orb runs only while working; "Submit another" resets it.

## Integration (Agent 3)

- Switch → `populate.setOutput` → invalidate `populate.form`. Form page:
  `populate.form` decides the layout, `populate.submit`'s `runs` seed the
  column, `runAi.onChange` streams until `closed`.

## Decisions

- A per-sheet flag read through `populate.form`: the public page needs no
  second query and no auth.
- The run stream is per sheet; the visitor's browser filters to its row. No
  auth exists anywhere today, so no new exposure — revisit with auth.
- Outputs are listed even when off, so the client never needs the column
  list from elsewhere.
- A dedicated reducer: the form shows per-cell failed / skipped states the
  grid collapses.

## Risks / open questions

- New dependency `@radix-ui/react-switch` in `packages/ui`.
- A reload after submitting loses the submission (component state); the row
  is saved regardless.

---

## Outcome

- **Shipped (api):** `Spreadsheet.formOutputEnabled` + migration
  `20261020120000_add_spreadsheet_form_output`; `spreadsheetMetaSchema` and
  `metaSelect` carry it, `SpreadsheetService.setFormOutput`;
  `populateFormSchema` += `outputEnabled`, `outputs` (the run-ai `isRunnable`
  set, display order), `populateSetOutputInput`; `PopulateService.form` lists
  the outputs, `setOutput` writes the flag and answers the form;
  `populate.setOutput` on the router (no REST twin). Contracts:
  `populate.api.test.ts` (24, incl. the REST GET's new fields) and
  `spreadsheet.api.test.ts` (71) green.
- **Shipped (dashboard):** `@reclit/ui/switch` (`@radix-ui/react-switch`,
  tokens `switch` / `switch-track` / `switch-thumb`, FRONTEND.md inventory);
  `/populate`: the switch row in the form card + `use-form-output.ts`;
  `/form/[id]`: `public-form-panel.tsx` two-column mode holding the
  submission, `public-form-output.tsx` (orb + per-column rows),
  `use-public-form-output.ts` (seed + `runAi.onChange` while working), pure
  `lib/public-form-output.ts` with `tests/public-form/public-form-output.test.ts`;
  `PublicForm.onDone` hands the submission up; messages
  `populate.form.output.*`, `publicForm.output.*`.
- **Verified:** lint, typecheck, the two contracts, the dashboard tests
  (243), the production build; in the browser with the Trigger worker running:
  the switch saved the flag (read back through the api), the form page showed
  two columns with the orb and "Ticket Summary — Waiting for your submission",
  a submitted row turned it to "Working… / Pending" and then "Done." with the
  generated summary while the stream opened and closed; off again, the page is
  single-column.
- **Deviated:** the `/populate` card's hint is one line, no output count; the
  switch click was driven through the page's handler (the hidden pane could
  not draw for a pointer click) — the control itself is Radix's.
- **Not done:** nothing per row for a visitor who reloads (component state).
- **Docs updated:** `docs/features/{populate,spreadsheet,index}.md`,
  `docs/routes/{populate,form}.md`, `docs/rules/FRONTEND.md`, the contract
  headers of `populate` and `spreadsheet`.
