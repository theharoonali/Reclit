# `/populate`

**Purpose:** shows the public form link for the spreadsheet, plus an API
placeholder.

**Rendering:** dynamic like every `(app)` route; the panel itself reads the
active workspace client-side.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/populate/page.tsx` | RSC | heading + metadata, renders the panel |
| `apps/dashboard/src/components/populate/populate-panel.tsx` | client | the form-link card (copy/open) and the API "coming soon" card |
| `apps/dashboard/src/config/populate.ts` | config | `formPath()` — the form path shape |

Shared pieces used: `@reclit/ui/button`,
`components/workspace/workspace-provider.tsx` (`useWorkspace`).

## APIs called

None directly. The link's id is the **active workspace's spreadsheet id**,
read from `useWorkspace()` (which owns the `workspace.list` cache) — so
switching workspaces switches the form link.

## Behaviour

- The card shows the absolute form URL for the active workspace's sheet
  (origin resolved after mount, so the server renders the bare path and
  hydration stays clean). With no workspace or sheet yet, the card shows a
  hint instead and Copy/Open are disabled.
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
