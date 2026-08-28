# `/form/[spreadsheetId]`

**Purpose:** a public, chrome-less form that appends one row to a spreadsheet —
one field per non-formula column, typed to match.

**Rendering:** dynamic (`force-dynamic`) — the fields mirror the sheet's live
columns.

This is the first route in the `(public)` route group: no sidebar, no header,
just the form and a "Powered by Reclit" footer
(`src/app/(public)/layout.tsx`). Different chrome means a second route group,
never a bespoke layout inside `(app)` (FRONTEND.md).

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(public)/layout.tsx` | RSC | chrome-less shell + powered-by footer |
| `apps/dashboard/src/app/(public)/form/[spreadsheetId]/page.tsx` | RSC | prefetches the sheet, centers the panel |
| `apps/dashboard/src/components/public-form/public-form-panel.tsx` | client | data, validation, upload + submit flow, success state |
| `apps/dashboard/src/components/public-form/public-form-fields.tsx` | client | one control per column type; presentational |
| `apps/dashboard/src/lib/public-form.ts` | lib | pure draft state + per-type validation mirroring the backend |

Shared pieces used: `@reclit/ui/{button,checkbox,input,label,textarea}`,
`components/common/{loading-state,error-state}`,
`lib/ai-spreadsheet/upload-file.ts`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `spreadsheet.rows` (limit 1) | query | `PublicFormPanel` | — |
| `spreadsheet.appendRow` | mutation | `PublicFormPanel` | nothing — the page's only query is columns-shaped |
| `POST /files` | REST | `PublicFormPanel` via `uploadFile()` | — |

Payloads and responses: the contract header of
`apps/api/src/__tests__/spreadsheet.api.test.ts`.
Backend detail: [docs/features/spreadsheet.md](../features/spreadsheet.md).
`spreadsheet.rows` is fetched with `limit: 1` — there is no columns-only
procedure and the form needs just the sheet name and columns.

## Behaviour

- Field per column type: string→text, number→number, date→native date input,
  email→email, url→url, json→textarea (must parse to a plain object),
  boolean→checkbox, audio/file→picked file behind a button. `formula` columns
  are never rendered.
- All fields are optional; submit is disabled until at least one field is
  filled. An unchecked checkbox is "no answer" and is omitted — never sent as
  `false`.
- Validation mirrors the backend (`lib/public-form.ts`): invalid number/
  email/url/json shows an inline per-field error and blocks the submit.
- Audio/file keep the picked `File` locally; submit uploads each through
  `POST /files` and sends the returned URL as the cell value. An upload
  failure surfaces on that field and nothing is submitted.
- Success replaces the form with a confirmation and a "Submit another
  response" reset. A server-side rejection shows a translated form-level
  error, never the server's message.
- An unknown sheet id shows a "form does not exist" error state — no
  `notFound()`, because the app's `not-found.tsx` would silently redirect
  to `/`.
- Known limitation: `X-Frame-Options: DENY` is set app-wide
  (`next.config.ts`), so the form cannot be embedded in an iframe.
- There is no auth anywhere in the API, so "public" adds no new exposure —
  see `docs/SECURITY.md`.

## Reusable pieces

- The `(public)` route group — any future chrome-less page joins it.
- `lib/public-form.ts` `validateField`/`isFilled` — pure, testable value
  rules for any client that writes cell values.

## Linked routes

- `/populate` ([populate.md](populate.md)) — where the link to this page is
  surfaced.
- `/ai-spreadsheet` ([ai-spreadsheet.md](ai-spreadsheet.md)) — submitted rows
  appear there at one past the highest stored row.
