# `/onboarding`

**Purpose:** the first run, as eight sliding screens. The user first fills
the account's company profile — what they will use Reclit for, their website
(read and summarised, then crawled behind), company documents and rules —
then names the workspace, uploads a CSV or `.xlsx` (or skips, and gets the named empty
workspace); the AI describes the sheet, proposes AI columns the user edits,
then "Create workspace and run AI" creates the workspace, runs the AI columns
over the first 10 rows and generates the dashboard while the user watches;
the page hands over to `/` when the generation ends.

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
| `apps/dashboard/src/components/onboarding/onboarding-purpose-screen.tsx` | client | Company screen 1: "What will you use Reclit for?" — `CompanyUseCasePicker` (six `ChoiceCard`s, several may be picked; Other reveals an `Input`, max 200), Next (disabled until something is picked; "Saving…" while the pick is written) |
| `apps/dashboard/src/components/onboarding/onboarding-website-screen.tsx` | client | Company screen 2: the website `Input`; Next on a new address reads it (a spinner line, the orb runs), then shows `CompanyCard`; Next on the saved address moves on. Back, Skip |
| `apps/dashboard/src/components/onboarding/onboarding-documents-screen.tsx` | client | Company screen 3: `CompanyDocumentUpload` (several files) + `CompanyDocumentList` (status chips, remove) and the "Company rules" `Textarea`, saved on Next. Back, Skip |
| `apps/dashboard/src/components/onboarding/use-onboarding-company.ts` | hook | The three company screens over `useCompany` + `useCompanyDocuments` (`components/company/`): `submitPurpose`, `submitWebsite`, `skipWebsite`, `saveSummary`, `submitDocuments`, `skipDocuments`, the error keys, `hasUseCases` (the resume input) |
| `apps/dashboard/src/components/onboarding/onboarding-name-screen.tsx` | client | The workspace name: the title and one `Input` under a `FormField` label (max 200, focused on mount), Back (to the documents) on the left, Next on the right (Enter submits; disabled while blank) |
| `apps/dashboard/src/components/onboarding/onboarding-upload-screen.tsx` | client | Screen 2: the title, one read-only `Input` that opens the file picker and shows the file, one example line, Back (to the name) on the left, Skip and Next on the right (Enter submits too). Skip calls `onboarding.skip` with the name and reads "Skipping…" until the gate leaves |
| `apps/dashboard/src/components/onboarding/onboarding-review-screen.tsx` | client | Screen 3: the title, the file and its counts, the "We see it as" `Input` (a label above it) and the description `Textarea` (its placeholder names it; spinner while the AI writes it), Back and Next under them |
| `apps/dashboard/src/components/onboarding/onboarding-column-list.tsx` · `onboarding-column-card.tsx` · `onboarding-column-form.tsx` | client | Screen 4: one divided list, a row per draft readable first (the name, chips for type and the AI mark, the prompt as two lines) with a pencil opening the form in place (name, type and kind `Select`s on one row, the prompt under; a column the user adds starts open), the "top 10 rows" caption, the "Tell us more" box when the AI asked for context, the add buttons, then Back and "Create workspace and run AI" |
| `apps/dashboard/src/components/onboarding/onboarding-finishing-screen.tsx` | client | Screen 5, watched: the title and the "first 10 rows" subtitle, "AI is filling N cells…" from `useDashboardLiveRows` while the batch runs, the worker's current detail line (`generationDetail`), the error line, then Cancel (ghost, while the generation is active), Try again (when `finish` could not start the batch) or Go to dashboard (once the generation ended). The checklist stays in the right column |
| `apps/dashboard/src/components/onboarding/onboarding-ai-panel.tsx` | client | The right column: the `AssistantOrb` (the same solving cube as the island) — `size-orb-lg` alone, with no label, on the company, name and upload screens, `size-orb-md` beside the live checklist after them (one transition); the checklist is the shared `StepList` (`components/common/step-list.tsx`) fed the translated `progress.*` labels |
| `apps/dashboard/src/components/onboarding/use-onboarding-wizard.ts` | hook | The stage machine (`purpose` → `website` → `documents` → `name` → `upload` → `review` → `columns` → `finishing`, Back one stage at a time): the start follows the company (no use cases → `purpose`, otherwise `name`); the name, the picked file, the describe result, the created workspace, the resume from `workspace.list` (a workspace with no flag → `finishing`, and `finish` is called once); composes the hooks below and derives the checklist with `progressFor` |
| `…/use-onboarding-describe.ts` · `use-onboarding-columns.ts` · `use-onboarding-skip.ts` · `use-onboarding-create.ts` · `use-onboarding-finish.ts` | hooks | One per call: `POST /onboarding/describe`; `onboarding.suggestColumns` + the column drafts; `onboarding.skip`; `POST /onboarding`; `onboarding.finish { rowLimit: 10 }` + the generation it started, through `useDashboardGeneration` (`components/dashboard/`) |
| `apps/dashboard/src/config/onboarding.ts` | config | `ONBOARDING_RUN_ROW_LIMIT = 10` — the `rowLimit` sent, the count the columns caption and the finishing subtitle show |
| `apps/dashboard/src/lib/onboarding/route.ts` | data | `onboardingRedirect(user, area)`, the pure helper the gate decides with |
| `apps/dashboard/src/lib/onboarding/api.ts` | data | `describeSheet`, `createWorkspace` (`postFile`), the hand-declared REST shapes, `workspaceNameFromFile`, `onboardingErrorKey` / `trpcErrorKey` / `trpcCodeOf` |
| `apps/dashboard/src/lib/onboarding/progress.ts` | pure | `OnboardingStage`, `progressFor(state)` → the twelve checklist items (purpose, website, documents — done only when there is something to show, so a skipped step stays pending — then upload, describe, columns, create, run, then analyze, propose, verify, apply from `generationSteps`) with `pending` / `active` / `done` / `failed` |
| `apps/dashboard/src/lib/onboarding/column-draft.ts` | pure | `ColumnDraftItem`, `fromSuggestions`, `newAiColumn` / `newPlainColumn`, `setColumnMode`, `columnDraftIssues` (blank, taken, no prompt), `toCreateColumns` |

Company pieces (shared with `/settings`): `components/company/`
(`company-card`, `company-document-list`, `company-document-upload`,
`company-use-case-picker`, `use-company`, `use-company-documents`),
`config/use-cases.ts`,
`lib/company/{api,use-cases,documents,website}.ts`,
`@reclit/ui/{choice-card,avatar,card}`.

Shared pieces used: `components/common/form-field.tsx`,
`components/common/chip.tsx`, `components/common/file-drop-zone.tsx`
(`multiple`),
`components/common/loading-state.tsx`, `components/common/error-state.tsx`,
`components/common/step-list.tsx`, `components/assistant/assistant-orb.tsx`,
`components/dashboard/use-dashboard-generation.ts`,
`components/dashboard/use-dashboard-live-rows.ts`,
`lib/dashboard/generation.ts` (`generationSteps`, `generationDetail`,
`isTerminalGeneration`), `hooks/use-file-picker.ts`,
`storeActiveWorkspaceId` from `components/workspace/workspace-provider.tsx`,
`SHEET_FILE_ACCEPT` from `lib/ai-spreadsheet/import-file.ts`,
`isColumnNameTaken`, `columnTypes`,
`@reclit/ui/{button,input,select,spinner,textarea}`, the `orb-md` /
`orb-lg` sizes and `animate-slide-up` / `animate-slide-in` from the preset.
Tests: `apps/dashboard/tests/onboarding/`, `apps/dashboard/tests/company/`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `user.me` | query | `OnboardingGate` (both route groups) | — |
| `company.me` | query | `useCompany` (via `useOnboardingCompany`), on load — empty `useCases` resumes at `purpose` | — |
| `company.onChange` | subscription | `useCompany({ live: true })` in `useOnboardingCompany`, while the wizard is mounted | replaces the `company.me` cache |
| `company.update { useCases, useCaseOther }` | mutation | `submitPurpose`, on Next from purpose (skipped when unchanged) | sets `company.me` from the response |
| `company.setWebsite { url }` | mutation | `submitWebsite`, on Next with a new address | sets `company.me` from the response |
| `company.update { summary }` | mutation | `saveSummary`, when the card's summary loses focus changed | sets `company.me` |
| `POST /files` then `company.addDocument { url, name, mimeType, size }` | REST + mutation | `useCompanyDocuments.add`, per picked file; a refused document's upload is removed with `DELETE /files` | refetch `company.me` |
| `company.removeDocument { id }` | mutation | `useCompanyDocuments.remove` | refetch `company.me` (also after a failure) |
| `company.update { rules }` | mutation | `submitDocuments`, on Next from documents (skipped when unchanged) | sets `company.me` |
| `workspace.list` | query | `useOnboardingWizard`, on load (resume) | — |
| `POST /onboarding/describe` (REST, multipart) | mutation | `useOnboardingDescribe`, when a file is picked | — |
| `onboarding.skip { name }` | mutation | `useOnboardingSkip`, on Skip | `workspace.list`, then `user.me` (the gate redirects); `user.me` alone on `CONFLICT` |
| `onboarding.suggestColumns` | mutation | `useOnboardingColumns`, on Next from screen 3 and on Suggest again | — |
| `POST /onboarding` (REST, multipart) | mutation | `useOnboardingCreate`, on Create workspace and run AI | `workspace.list` (and `user.me` on `ONBOARDING_ALREADY_COMPLETED`) |
| `onboarding.finish { workspaceId, rowLimit: 10 }` | mutation | `useOnboardingFinish`, as soon as the workspace exists (created or resumed) | `dashboardGeneration.latest`, `dashboard.byWorkspace`, `workspace.list` at once; `user.me` only when `generationId` is null, on `CONFLICT`, or later when the generation completes |
| `dashboardGeneration.latest` | query | `useDashboardGeneration` (inside `useOnboardingFinish`) | — |
| `dashboardGeneration.onChange` | subscription | `useDashboardGeneration`, while the generation is alive | `dashboard.byWorkspace` + the sheet rows on `completed` |
| `dashboardGeneration.cancel` | mutation | `useDashboardGeneration`, on Cancel | — |
| `runAi.listActive` · `runAi.onChange` | query · subscription | `useDashboardLiveRows`, on the finishing screen | the sheet rows as runs complete |

The `company.*` errors map per procedure from the tRPC code
(`companyErrorKey` in `lib/company/api.ts`; see [settings.md](settings.md)).
Payloads and responses are in the contract headers of
`apps/api/src/__tests__/onboarding.api.test.ts`, `company.api.test.ts` (and `dashboard-generation`,
`run-ai`, `user`, `workspace` for the others). Backend detail is in
[docs/features/onboarding.md](../features/onboarding.md).

## Behaviour

- **Gate:** every `(app)` page and this page start with a full-screen
  spinner while `user.me` loads. `onboardingCompleted: false` means the user
  belongs here; `true` means `/`. The flag turns true on Skip or on
  `finish`, so a reload anywhere before that lands back here.
- **Company screens.** *Purpose:* six cards (lead research, hiring,
  email outreach, form intake, customer insights, other), several may be
  picked; Other opens a field (max 200). Next is disabled until a card is
  checked and writes the pick. *Website:* one field; Next on a new address
  reads the homepage (seconds) and shows the card — the site's icon (the
  initial until it loads), the name, the host as a link, the summary
  (editable, saved on blur) and "Reading the rest of your site…" while the
  crawl runs (`crawlStatus: CRAWLING`; "Read N pages of your site" once
  `READY`, a destructive line if `FAILED`); Next again moves on; Skip moves
  on without one. *Documents:* a drop zone that takes several files (PDF,
  PNG, JPG, WEBP, TXT, MD, CSV; ≤ 15 MB; ≤ 10 documents — refused before
  upload), each listed with a chip (uploading, reading, ready, failed) and a
  remove button; the "Company rules" field is saved on Next; Skip moves on
  without saving the rules. Errors map from the codes through
  `companyErrorKey` (`lib/company/api.ts`) to `company.errors.*`.
- **Company resume.** A company with no use cases starts at purpose; one
  with use cases starts at the name (the resume to finishing still wins).
- **Screen 1, name.** The title and one labelled field, focused. Next (or
  Enter) is disabled while the name is blank and slides to screen 2; Back
  returns to the documents. The
  name is the workspace's from here on; nothing overwrites it. The right
  column is the AI canvas alone, large, with no label under it.
- **Screen 2, upload.** One field. Clicking it opens the picker; the picked
  file's name shows in it and `POST /onboarding/describe` starts at once.
  Back returns to the name. Skip calls `onboarding.skip` with the name: the
  new empty workspace becomes the active one, `workspace.list` then
  `user.me` are refetched and the gate replaces the route with `/`, where
  the dashboard shows its empty state; the buttons read "Skipping…" and stay
  disabled until then. Next, or Enter, slides to screen 3.
- **Screen 3, review.** The label and the description fill themselves from
  the answer and stay editable. Next sends them with the name and the
  describe step's columns and sample rows to `onboarding.suggestColumns`.
  The right column shrinks the canvas and shows the checklist: a check for
  the file and the description, then the remaining steps.
- **Screen 4, columns.** The proposals as rows: name, type, the AI mark,
  the prompt; the pencil opens the form in place, the bin removes, the
  buttons add a blank AI or plain column (open). A blank name, a name the
  file or another row uses, or an AI column without a prompt is flagged on
  the row and blocks the create. Under the list a caption says the AI will
  analyze the top 10 rows only (`ONBOARDING_RUN_ROW_LIMIT`). When the model
  proposed nothing usable it asks a question; "Tell us more" appends the
  answer to the description and asks again (the AI's earlier proposals are
  replaced, the user's own columns kept). Back slides to screen 3. "Create
  workspace and run AI" sends the file again with the fields and the
  columns as JSON; the checklist ticks "Workspace created" and the wizard
  moves to screen 5 on its own.
- **Screen 5, finishing.** As soon as the workspace exists (just created,
  or found on reload through `workspace.list`) the wizard calls
  `onboarding.finish { rowLimit: 10 }` once: the api runs every AI column
  over the first 10 rows as one batch, sets the flag and starts the
  dashboard generation. The screen shows "AI is filling N cells…" while the
  batch runs (`runAi.onChange`), the worker's current detail line, and the
  right column's checklist follows the generation through
  `dashboardGeneration.onChange` — "AI filling the first rows" while it
  waits for the batch, then reading, proposing, checking, building. Cancel
  (ghost) ends the generation. **`user.me` is refetched — and the gate
  replaces the route with `/` — only when the generation completes, or when
  `finish` answered `generationId: null` (nothing to wait for; the
  dashboard's pill is the fallback).** A failed or cancelled generation
  shows `errorGenerate` and a "Go to dashboard" button instead; `/` shows
  the same generation card with Try again ([root.md](root.md)).
- **Resume.** A reload between `create` and `finish` keeps the user here:
  `workspace.list` returns the workspace, the wizard opens at screen 5 and
  calls `finish` again. `CONFLICT` (already finished — the flag is true)
  refetches `user.me` so the gate moves on.
- **Motion.** Each screen slides in from the right (`animate-slide-in`,
  `motion-reduce:animate-none`), on Next and on Back alike; the checklist
  rises into place; the canvas size change is a transition; the orb runs
  while any call or the generation is in flight.
- **Errors** map from the REST `ApiError.code` or the tRPC code to the
  `onboarding.*` keys: the import codes (under the upload field),
  `errorName` (a field too long), `errorColumnName` (409 on create: nothing
  was created, fix the name), `aiUnavailable` (no key on the api: the fields
  stay editable, columns can be added by hand), `aiFailed`, `errorRun` (the
  batch could not be dispatched; the flag stays false, Try again repeats
  `finish`), `errorGenerate` (the generation failed, was cancelled or could
  not start), `errorConflict`, and the generic `error`.
  `ONBOARDING_ALREADY_COMPLETED` / `CONFLICT` refetch `user.me` so the gate
  moves on.

## Reusable pieces

- `OnboardingGate` is the one place that sends a user to a route based on
  their state. Extend `onboardingRedirect` rather than adding a second gate.
- `progressFor` + `StepList` (`components/common/step-list.tsx`) — a live
  checklist for any multi-call flow; the dashboard's generation card uses
  the same list, and `progressFor` folds `generationSteps` into the wizard's
  own steps.
- `useDashboardGeneration` and `useDashboardLiveRows`
  (`components/dashboard/`) follow a generation and a run-ai batch from any
  page, not only `/`.

## Linked routes

- `/` ([root.md](root.md)): the gate sends a user here when onboarding is
  done, and sends a user who has not onboarded from here to this page; a
  generation that is still running, or failed, is shown there as the same
  progress card.
