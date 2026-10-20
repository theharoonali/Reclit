# `/onboarding`

**Purpose:** the first run, as four sliding screens. The user uploads a CSV
or `.xlsx`; the AI describes it, proposes AI columns the user edits, then
proposes dashboard cards the user edits; "Run AI" creates the dashboard,
starts the AI columns and hands the user to `/`.

**Rendering:** dynamic, the same as every route (the `locale` cookie opts the
app out of prerendering). The decision to show this page is made on the
client by `OnboardingGate`; the page is one client component, two columns
filling the viewport. The left column keeps a static logo and the
Reclit name at its top left; the page itself does not scroll.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(onboarding)/layout.tsx` | RSC | The `(onboarding)` route group has no chrome: `<OnboardingGate area="onboarding">` around an `h-dvh overflow-hidden` wrapper — the page never scrolls; a column does when its screen is taller |
| `apps/dashboard/src/app/(onboarding)/onboarding/page.tsx` | RSC | `pageMetadata("onboarding")` + `<OnboardingWizard />` |
| `apps/dashboard/src/components/onboarding/onboarding-gate.tsx` | client | `user.me` → full-screen `LoadingState` while pending or redirecting, full-screen `ErrorState` on failure, otherwise its children. Also mounted by `(app)/layout.tsx` with `area="app"` |
| `apps/dashboard/src/components/onboarding/onboarding-wizard.tsx` | client | The page: `useOnboardingWizard` → the viewport-high two-column grid (stacked, half-height each, below `lg`). Left, a static lockup (`/brand/icon-fill.png` and `APP_NAME`) at the top left that does not scroll, then the current screen, vertically centred, re-mounted per stage with `animate-slide-in`; right, `<OnboardingAiPanel>` |
| `apps/dashboard/src/components/onboarding/onboarding-upload-screen.tsx` | client | Screen 1: the title, one read-only `Input` that opens the file picker and shows the file, one example line, Skip (no action yet) beside Next at the bottom right (Enter submits too) |
| `apps/dashboard/src/components/onboarding/onboarding-review-screen.tsx` | client | Screen 2: the title, the file and its counts, the name and "We see it as" `Input`s side by side (a label above each) and the description `Textarea` (its placeholder names it; spinner while the AI writes it), Back and Next under them |
| `apps/dashboard/src/components/onboarding/onboarding-column-list.tsx` · `onboarding-column-card.tsx` · `onboarding-column-form.tsx` | client | Screen 3: one divided list, a row per draft readable first (the name, chips for type and the AI mark, the prompt as two lines) with a pencil opening the form in place (name, type and kind `Select`s on one row, the prompt under; a column the user adds starts open), the "Tell us more" box when the AI asked for context, the add buttons, then Back and Create workspace |
| `apps/dashboard/src/components/onboarding/onboarding-widget-list.tsx` · `onboarding-widget-card.tsx` · `onboarding-widget-form.tsx` · `onboarding-widget-series.tsx` | client | Screen 4: one divided list, a row per proposed card showing its title, chart type and subtitle — no formulas — with a pencil opening the config in place (title, subtitle, chart, style, x axis + date bucket, the y series), the engine's first issue as a caption, Add card on the left, the summary line and Run AI on the right |
| `apps/dashboard/src/components/onboarding/onboarding-ai-panel.tsx` · `onboarding-progress.tsx` · `onboarding-chip.tsx` | client | The right column: the `AssistantOrb` — `size-orb-lg` alone on screen 1, `size-orb-md` beside the live checklist after it (one transition); the checklist (`OnboardingProgress`: a check on what is done, a spinner on what is happening); the small label chip the rows share |
| `apps/dashboard/src/components/onboarding/use-onboarding-wizard.ts` | hook | The stage machine (`upload` → `review` → `columns` → `widgets`): fields, the picked file, the describe result, the created workspace, the resume from `workspace.list`; composes the hooks below and derives the checklist with `progressFor` |
| `…/use-onboarding-describe.ts` · `use-onboarding-columns.ts` · `use-onboarding-create.ts` · `use-onboarding-widgets.ts` · `use-onboarding-finish.ts` | hooks | One per call: `POST /onboarding/describe`; `onboarding.suggestColumns` + the column drafts; `POST /onboarding`; `spreadsheet.rows` (one page, for the columns) + `assistant.recommendWidgets` + the card drafts; `dashboard.replace` → `onboarding.finish` |
| `apps/dashboard/src/lib/onboarding/route.ts` | data | `onboardingRedirect(user, area)`, the pure helper the gate decides with |
| `apps/dashboard/src/lib/onboarding/api.ts` | data | `describeSheet`, `createWorkspace` (`postFile`), the hand-declared REST shapes, `workspaceNameFromFile`, `onboardingErrorKey` / `trpcErrorKey` / `trpcCodeOf` |
| `apps/dashboard/src/lib/onboarding/progress.ts` | pure | `OnboardingStage`, `progressFor(state)` → the six checklist items (upload, describe, columns, create, cards, run) with `pending` / `active` / `done` |
| `apps/dashboard/src/lib/onboarding/column-draft.ts` | pure | `ColumnDraftItem`, `fromSuggestions`, `newAiColumn` / `newPlainColumn`, `setColumnMode`, `columnDraftIssues` (blank, taken, no prompt), `toCreateColumns` |
| `apps/dashboard/src/lib/onboarding/widget-draft.ts` | pure | `WidgetDraft`, `fromRecommendations`, `newWidgetDraft`, `setType` / `setGroupBy` / `updateSeries` / `addSeries` / `removeSeries`, `widgetDraftIssues` (the engine's `validateWidget`), `isFormulaValid`, `toWidgetInputs` (slots from the engine's `placeWidgets`) |

Shared pieces used: `components/common/form-field.tsx`,
`components/common/loading-state.tsx`, `components/common/error-state.tsx`,
`components/assistant/assistant-orb.tsx`, `hooks/use-file-picker.ts`,
`storeActiveWorkspaceId` from `components/workspace/workspace-provider.tsx`,
`SHEET_FILE_ACCEPT` from `lib/ai-spreadsheet/import-file.ts`,
`isColumnNameTaken`, `columnTypes`, `widgetIssueMessageKey`,
`@reclit/dashboard-engine` (`validateWidget`, `tryParseFormula`,
`placeWidgets`, the vocabularies), `@reclit/ui/{button,input,select,spinner,textarea}`,
the `orb-md` / `orb-lg` sizes and `animate-slide-up` from the preset.
Tests: `apps/dashboard/tests/onboarding/`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `user.me` | query | `OnboardingGate` (both route groups) | — |
| `workspace.list` | query | `useOnboardingWizard`, on load (resume) | — |
| `POST /onboarding/describe` (REST, multipart) | mutation | `useOnboardingDescribe`, when a file is picked | — |
| `onboarding.suggestColumns` | mutation | `useOnboardingColumns`, on Next from screen 2 and on Suggest again | — |
| `POST /onboarding` (REST, multipart) | mutation | `useOnboardingCreate`, on Create workspace | `workspace.list` (and `user.me` on `ONBOARDING_ALREADY_COMPLETED`) |
| `spreadsheet.rows` (`limit: 1`) | query | `useOnboardingWidgets`, once the workspace exists | — |
| `assistant.recommendWidgets` | mutation | `useOnboardingWidgets`, once per workspace | — |
| `dashboard.replace` | mutation | `useOnboardingFinish`, on Run AI (skipped with no cards) | — |
| `onboarding.finish` | mutation | `useOnboardingFinish`, right after | `dashboard.byWorkspace`, `workspace.list`, then `user.me` (the gate redirects) |

Payloads and responses are in the contract headers of
`apps/api/src/__tests__/onboarding.api.test.ts` (and `assistant`,
`dashboard`, `spreadsheet`, `user` for the others). Backend detail is in
[docs/features/onboarding.md](../features/onboarding.md).

## Behaviour

- **Gate:** every `(app)` page and this page start with a full-screen
  spinner while `user.me` loads. `onboardingCompleted: false` means the user
  belongs here; `true` means `/`. The flag turns true only on Run AI, so a
  reload anywhere in the wizard lands back here.
- **Screen 1, upload.** The title and one field. Clicking the
  field opens the picker; the picked file's name shows in it and
  `POST /onboarding/describe` starts at once. Skip (no action yet) sits
  beside Next under the field; Next, or Enter, slides to screen 2 (the
  field is a form). The right column is the AI canvas alone, large.
- **Screen 2, review.** The name (unless typed), the label and the
  description fill themselves from the answer and stay editable. Next sends
  them with the describe step's columns and sample rows to
  `onboarding.suggestColumns`. The right column shrinks the canvas and shows
  the checklist: a check for the file and the description, then the
  remaining steps.
- **Screen 3, columns.** The proposals as rows: name, type, the AI mark,
  the prompt; the pencil opens the form in place, the bin removes, the
  buttons add a blank AI or plain column (open). A blank name, a name the
  file or another row uses, or an AI column without a prompt is flagged on
  the row and blocks Create. When the model proposed nothing usable it asks
  a question; "Tell us more" appends the answer to the description and asks
  again (the AI's earlier proposals are replaced, the user's own columns
  kept). Back slides to screen 2. Create workspace sends the
  file again with the fields and the columns as JSON; the checklist ticks
  "Workspace created".
- **Screen 4, cards.** Once the workspace exists (just created, or found on
  reload through `workspace.list`) the page reads the sheet's columns and
  asks `assistant.recommendWidgets` once; the proposals appear as rows with
  their title, chart type and subtitle — no formulas or previews, the AI
  columns are still empty. The pencil opens the config (chart, style, x
  axis with a bucket for a date column, the y series as label + formula with
  `{Column}` references); the engine's first issue shows under the row and
  blocks Run AI. Add card starts a row count by the first text column.
- **Run AI** replaces the dashboard's cards (placed top-first, the api's
  own rule) and calls `onboarding.finish`, which runs every AI column over
  the stored rows as one batch (within the batch caps) and sets the flag;
  `user.me` is refetched last, so the gate replaces the route with `/` and
  the dashboard opens with the cards in place and "AI is filling N cells…"
  in the header while the runs complete ([root.md](root.md)).
- **Motion.** Each screen slides in from the right (`animate-slide-in`,
  `motion-reduce:animate-none`), on Next and on Back alike; the checklist
  rises into place; the canvas size change is a transition; the orb runs
  while any call is in flight. Every screen's title is `text-title`; the
  forms carry no labels, the placeholders name the fields.
- **Errors** map from the REST `ApiError.code` or the tRPC code to the
  `onboarding.*` keys: the import codes (under the upload field),
  `errorName` (a field too long), `errorColumnName` (409 on create: nothing
  was created, fix the name), `aiUnavailable` (no key on the api: the fields
  stay editable, columns can be added by hand, cards too), `aiFailed`,
  `errorWidgets` (a card the api refused), `errorRun` (the batch could not
  be dispatched; the flag stays false, Run AI can be retried), and the
  generic `error`. `ONBOARDING_ALREADY_COMPLETED` / `CONFLICT` refetch
  `user.me` so the gate moves on.

## Reusable pieces

- `OnboardingGate` is the one place that sends a user to a route based on
  their state. Extend `onboardingRedirect` rather than adding a second gate.
- `progressFor` + `OnboardingProgress` — a live checklist for any multi-call
  flow.
- `lib/onboarding/widget-draft.ts` is the first editable widget config in
  the app: the piece to grow into a dashboard-side card editor.

## Linked routes

- `/` ([root.md](root.md)): the gate sends a user here when onboarding is
  done, and sends a user who has not onboarded from here to this page; the
  dashboard keeps its figures moving while the wizard's batch runs.
