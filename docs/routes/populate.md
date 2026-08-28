# `/populate`

**Purpose:** shows the public form link for the spreadsheet, plus an API
placeholder.

**Rendering:** static — the page shows a configured link and calls no API.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/populate/page.tsx` | RSC | heading + metadata, renders the panel |
| `apps/dashboard/src/components/populate/populate-panel.tsx` | client | the form-link card (copy/open) and the API "coming soon" card |
| `apps/dashboard/src/config/populate.ts` | config | the hardcoded target sheet id and `formPath()` |

Shared pieces used: `@reclit/ui/button`.

## APIs called

None. The link target is `POPULATE_FORM_SPREADSHEET_ID` in
`src/config/populate.ts` — hardcoded until the dashboard grows
per-spreadsheet routing.

## Behaviour

- The card shows the absolute form URL (origin resolved after mount, so the
  server renders the bare path and hydration stays clean).
- "Copy link" writes the absolute URL to the clipboard and flips its label to
  "Copied" for two seconds; "Open form" opens the public page in a new tab.
- The API card is a placeholder: heading + "Coming soon".

## Reusable pieces

- `formPath(spreadsheetId)` in `src/config/populate.ts` — the one place the
  public form's path shape is written.

## Linked routes

- `/form/[spreadsheetId]` ([form.md](form.md)) — the public page this link
  opens.
- `/ai-spreadsheet` ([ai-spreadsheet.md](ai-spreadsheet.md)) — where submitted
  rows appear.
