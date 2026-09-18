# `/populate`

**Purpose:** the two ways to fill the spreadsheet from outside the grid — the
public form's link, and the Populate API with a ready-to-copy request.

**Rendering:** dynamic like every `(app)` route; the panel itself reads the
active workspace client-side.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/populate/page.tsx` | RSC | heading + metadata, renders the panel |
| `apps/dashboard/src/components/populate/populate-panel.tsx` | client | the form-link card (copy/open) and the API card's frame |
| `apps/dashboard/src/components/populate/populate-api-card.tsx` | client | endpoint, curl example, notes; loading / error |
| `apps/dashboard/src/components/populate/use-copy.ts` | hook | clipboard write + a two-second `copied` flag |
| `apps/dashboard/src/lib/populate/curl-example.ts` | lib | pure `buildCurlExample` + a sample value per column type |
| `apps/dashboard/src/config/populate.ts` | config | `formPath()`, `submitPath()` — the two path shapes |

Shared pieces used: `@reclit/ui/button`,
`components/common/{loading-state,error-state}`,
`components/workspace/workspace-provider.tsx` (`useWorkspace`),
`lib/api-fetch.ts` (`API_BASE_URL`).
Tests: `apps/dashboard/tests/populate/curl-example.test.ts`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `populate.form` | query | `PopulateApiCard` | — |

Payloads and responses: the contract header of
`apps/api/src/__tests__/populate.api.test.ts`. Backend detail:
[docs/features/populate.md](../features/populate.md).

Both cards address the **active workspace's spreadsheet id**, read from
`useWorkspace()` (which owns the `workspace.list` cache) — so switching
workspaces switches the form link and the API endpoint.

## Behaviour

- The form card shows the absolute form URL for the active workspace's sheet
  (origin resolved after mount, so the server renders the bare path and
  hydration stays clean). With no workspace or sheet yet, the card shows a
  hint instead and Copy/Open are disabled.
- "Copy link" writes the absolute URL to the clipboard and flips its label to
  "Copied" for two seconds; "Open form" opens the public page in a new tab.
- The API card shows `POST ${API_BASE_URL}/populate/<id>` and a curl whose body
  is built from the sheet's real fillable fields (`populate.form`), one sample
  value per column type, each with its own Copy. It is the same submit the
  public form performs: the row is added and the sheet's AI columns run for
  it. The notes under it state the `fields` shape, the 201 response
  (`row`, `runs`, `runError`), the 400/404 cases, that file and audio columns
  take a URL, and that browsers on other origins are blocked by CORS.
- The card's `populate.form` query has `staleTime: 0`: the fields are the
  sheet's columns, which change on `/ai-spreadsheet`, through the API or in
  another tab — none of which can invalidate it — so opening or refocusing
  the page refetches, and a column added a moment ago is in the curl.
- The endpoint is on the **API** origin, not the dashboard's. Sample values and
  the `POST` verb are code, not copy, so they are not message keys.
- With no workspace the API card shows a hint instead of the endpoint.

## Reusable pieces

- `formPath` / `submitPath` in `src/config/populate.ts` — the one place each
  path shape is written.
- `useCopy()` — any copy-to-clipboard button.

## Linked routes

- `/form/[spreadsheetId]` ([form.md](form.md)) — the public page this link
  opens.
- `/ai-spreadsheet` ([ai-spreadsheet.md](ai-spreadsheet.md)) — where submitted
  rows appear.
