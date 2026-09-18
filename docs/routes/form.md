# `/form/[spreadsheetId]`

**Purpose:** a public form that adds one row to a spreadsheet — one field per
fillable column, typed to match — and starts the sheet's AI columns for that
row.

**Rendering:** dynamic (`force-dynamic`) — the fields mirror the sheet's live
columns.

This is the first route in the `(public)` route group: no sidebar and no app
header, just the page's own header, the form and a "Powered by Reclit" footer
(`src/app/(public)/layout.tsx`). Different chrome means a second route group,
never a bespoke layout inside `(app)` (FRONTEND.md).

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(public)/layout.tsx` | RSC | chrome-less shell + powered-by footer |
| `apps/dashboard/src/app/(public)/form/[spreadsheetId]/page.tsx` | RSC | metadata, renders the panel — no prefetch |
| `apps/dashboard/src/components/public-form/public-form-panel.tsx` | client | `populate.form` query; header + `<main>` with loading / error / empty / form / success |
| `apps/dashboard/src/components/public-form/public-form-header.tsx` | RSC-safe | the sheet's name over a bottom border, in the app header's geometry |
| `apps/dashboard/src/components/public-form/public-form.tsx` | client | the form card: draft, inline errors, `populate.submit` |
| `apps/dashboard/src/components/public-form/public-form-fields.tsx` | client | the two-column grid, one control per column type, placeholders |
| `apps/dashboard/src/components/public-form/public-form-file-field.tsx` | client | file selector: drop target → uploading → uploaded (replace / remove) → error |
| `apps/dashboard/src/components/public-form/use-public-form-uploads.ts` | hook | upload on pick, delete on remove / replace |
| `apps/dashboard/src/components/public-form/public-form-success.tsx` | client | confirmation + "Submit another response" |
| `apps/dashboard/src/lib/public-form.ts` | lib | pure draft state, per-type validation mirroring the backend, `toSubmitFields` |
| `apps/dashboard/src/lib/upload-file.ts` | lib | `uploadFile`, `deleteFile`, `MAX_UPLOAD_BYTES` |

Shared pieces used: `@reclit/ui/{button,checkbox,input,label,textarea,spinner}`,
`components/common/{form-field,loading-state,error-state}`,
`hooks/{use-file-picker,use-latest-ref}`, `lib/format-file-size.ts`.
Tests: `apps/dashboard/tests/public-form/public-form.test.ts`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `populate.form` | query | `PublicFormPanel` | — |
| `populate.submit` | mutation | `PublicForm` | nothing — the page holds no list |
| `POST /files` | REST | `usePublicFormUploads` via `uploadFile()` | — |
| `DELETE /files` | REST | `usePublicFormUploads` via `deleteFile()` | — |

Payloads and responses: the contract headers of
`apps/api/src/__tests__/populate.api.test.ts` and `file.api.test.ts`.
Backend detail: [docs/features/populate.md](../features/populate.md),
[file.md](../features/file.md).

## Behaviour

- **Header:** the spreadsheet's name, sticky, over a bottom border
  (`h-header`, like `components/layout/app-header.tsx`). It is local markup:
  the header outlets exist only under `(app)`. Until the name arrives it shows
  the page title.
- **Which columns are fields is the server's call** (`populate.form`): formula
  columns and AI (node) columns are never rendered. Fields follow the sheet's
  column order, so reordering a column in `/ai-spreadsheet` reorders the form.
- **Layout:** two fields to a row from `md` up, one below. JSON and file fields
  take the whole row; a checkbox sits on the control line of its neighbour.
- Field per column type: string→text, number→number, date→native date input,
  email→email, url→url, json→textarea (must parse to a plain object),
  boolean→checkbox, audio/file→file selector. Every text-shaped control has a
  placeholder (`publicForm.placeholders`; string fields name the column).
- **File selector:** a dashed drop target (drag-and-drop, or the button — the
  keyboard path). A picked file **uploads immediately** through `POST /files`;
  files over 25 MB are refused before any bytes are sent. Once uploaded the
  field shows the name and size with Replace and Remove. **Remove deletes the
  upload from storage** (`DELETE /files`), and so does replacing it; both
  deletes are best-effort and never block the form.
- Submit is disabled until at least one field is filled and while any upload
  is in flight. An unchecked checkbox is "no answer" and is omitted — never
  sent as `false`.
- Validation mirrors the backend (`lib/public-form.ts`): invalid number/
  email/url/json shows an inline per-field error and blocks the submit.
- **Submitting runs the AI columns.** `populate.submit` appends the row, then
  starts every runnable AI column for it; the visitor sees only the
  confirmation. A `runError` in the response is not shown — the row is saved.
- Success replaces the form with a confirmation and a "Submit another
  response" reset. The form unmounts on success, so its draft — and with it
  any remove button — is gone: a file a saved row references can never be
  deleted from here. A server-side rejection shows a translated form-level
  error, never the server's message, and keeps the draft and its uploads.
- An unknown sheet id shows a "form does not exist" error state — no
  `notFound()`, because the app's `not-found.tsx` would silently redirect
  to `/`.
- Known limitation: a visitor who uploads a file and leaves without submitting
  or removing it leaves that upload in storage. Nothing tracks uploads, so
  nothing collects them.
- Known limitation: `X-Frame-Options: DENY` is set app-wide
  (`next.config.ts`), so the form cannot be embedded in an iframe.
- There is no auth anywhere in the API, so "public" adds no new exposure —
  see `docs/SECURITY.md`.

## Reusable pieces

- The `(public)` route group — any future chrome-less page joins it.
- `lib/public-form.ts` `validateField`/`isFilled`/`toSubmitFields` — pure,
  tested value rules for any client that submits to `populate.submit`.
- `lib/upload-file.ts` — the file endpoints, shared with the grid's upload
  editor.

## Linked routes

- `/populate` ([populate.md](populate.md)) — where the link to this page, and
  the API that does the same submit, are surfaced.
- `/ai-spreadsheet` ([ai-spreadsheet.md](ai-spreadsheet.md)) — submitted rows
  appear there at one past the highest stored row, their AI cells running.
