# 042 — Dashboard generation pipeline, onboarding rework and chart polish

**Status:** implemented
**Scope:** full feature

## Goal

One Trigger.dev task builds a workspace's dashboard for both entry points — the
onboarding wizard and the empty dashboard's "AI Recommendations" pill — in
phases the user watches live: analyze the sheet (columns, profile, sample
rows) into a brief, propose cards that answer the brief's questions, pack them
into full 12-column rows, verify every card against the data (empty, single
group, too many slices, long labels, aggregating an identifier, duplicates) and
have a reviewer model judge value and layout, retry once with every mistake fed
back, apply the best attempt. Fewer valuable cards beat many. Onboarding asks
the workspace name first, lets the user skip the upload (named empty workspace,
straight to `/`), runs the AI columns over the first 10 rows only and says so,
then generates the dashboard and lands on `/`. The charts handle long labels,
large figures and distinct series colours.

## Backend (Agent 1)

- **Table:** `DashboardGeneration` — `id`, `workspaceId`, `spreadsheetId`,
  `source` (`ONBOARDING | DASHBOARD`), `status` (`PENDING RUNNING COMPLETED
  FAILED CANCELLED`), `phase` (`QUEUED WAITING_FOR_ROWS ANALYZING PROPOSING
  LAYING_OUT VERIFYING RETRYING APPLYING DONE`), `attempt`, `awaitBatchId?`,
  `log Json`, `brief Json?`, `result Json?`, `error Json?`, `model?`, `usage
  Json?`, `triggerRunId?`, timestamps. Partial unique "one active per
  workspace"; trigger `dashboard_generation_notify` →
  `pg_notify('dashboard_generation_changed', id)`.
- **Procedures:** `dashboardGeneration.start { workspaceId, source }` →
  generation (NOT_FOUND, CONFLICT busy, SERVICE_UNAVAILABLE no key, BAD_GATEWAY
  dispatch); `byId`, `active`, `cancel`, `onChange` (SSE snapshot | generation
  | closed). `onboarding.skip { name }` → `{ user, workspace }`;
  `onboarding.finish` gains `generationId: string | null`.
  `assistant.recommendWidgets` is removed.
- **Service methods:** `DashboardGenerationService` (Prisma writer, guarded
  transitions), `DashboardGenerationControlService.start/cancel`
  (`setDispatcher`), `DashboardGenerationPipelineService.run(generation,
  deps)` (prisma-free, generators injectable), the task
  `src/trigger/generate-dashboard.ts` (waits for the onboarding run-ai batch
  with `wait.for`, then the pipeline), `src/jobs/dashboard-generation-dispatch.ts`.
- **Engine:** `verifyDashboard`, `verifyLayout`, `packDashboard` in
  `@reclit/dashboard-engine`.
- **Reused:** `loadAssistantContext` (+ `payload`), `describeData`,
  `WIDGET_GRAMMAR`, `CHART_SENSE_RULES`, `recommendationCardSchema` (moved),
  `toWidgetQueryInput`, `defaultWidgetSpan`, `dashboardService.replace`,
  `runAiService.listByBatch`, `LiveFeed`, the assistant run's guarded
  transition idiom.

## Frontend (Agent 2)

- **Routes:** `/onboarding` screens become name → upload-or-skip → review
  (no name field) → columns (top-10 notice) → finishing (live progress). `/`
  shows a progress card while a generation runs and a "no value" empty state
  when none applied.
- **Components:** new `onboarding-name-screen`, `onboarding-finishing-screen`,
  `use-onboarding-skip`, `common/step-list` (moved checklist),
  `dashboard/use-dashboard-generation`, `dashboard-generation-progress`,
  `lib/dashboard/generation`, `lib/dashboard/axis`; removed: the onboarding
  widget editor (`onboarding-widget-*`, `use-onboarding-widgets`,
  `widget-draft`) and the recommendation previews
  (`use-dashboard-recommendations`, `dashboard-recommendation*`).
- **Charts:** `tickPolicy` (truncate / rotate / auto-horizontal), compact axis
  figures with dynamic width, tooltip prefix/suffix, five distinct chart hues,
  equal-height rows, richer stat cards.

## Integration (Agent 3)

- Columns "Create workspace" → `POST /onboarding` → `onboarding.finish
  { rowLimit: 10 }` → the finishing screen follows `runAi` cells and
  `dashboardGeneration.onChange`; `user.me` is invalidated when the generation
  is terminal (or none started) so the gate moves to `/`.
- Skip → `onboarding.skip` → `workspace.list`, `user.me` invalidated.
- Pill → `dashboardGeneration.start { source: "dashboard" }`; a completed
  generation invalidates `dashboard.byWorkspace` and the sheet rows.

## Decisions

- New `DashboardGeneration` table over `AssistantRun`: the assistant's one-active
  index would make a generation block the capsule, its step enum is closed and
  it has no result column.
- The task polls the onboarding batch's `RunAi` rows with `wait.for` instead of
  `triggerAndWait` on `run-ai-batch`: `onboarding.finish` keeps creating the
  rows in the api (live sheet stream, `rowLimit` contract) and the batch's
  trigger run id is not stored.
- Deterministic verification lives in the engine so the browser can reuse it;
  the reviewer model judges value, the engine judges correctness.
- Auto-apply everywhere (the onboarding cards editor and the dashboard previews
  are removed) — decided with the user; the pill stays empty-dashboard-only.
- `onboarding.finish` sets the flag before the generation ends: a worker
  outage must not strand the user on `/onboarding`; `/` shows the same progress.

## Risks / open questions

- Onboarding AI columns hold values for 10 rows only; cards over them compute
  from 10 points and may be dropped as `SINGLE_GROUP` / `EMPTY_RESULT`.
- Two new Gemini response schemas (brief, review) — one smoke call each.
- The palette change recolours every chart; `chart-5` consumers checked first.

---

## Outcome

- **Shipped (engine):** `src/verify.ts` + `verify-query.ts` (`verifyDashboard`
  with eleven codes, `verifyLayout`, the caps), `packDashboard` in
  `layout.ts` (stat widths by count; the odd 6-wide that widens to 12 is the
  last bar/line/area/heatmap/radar, never a pie); `tests/verify.test.ts`,
  `layout.test.ts` — 116 engine tests.
- **Shipped (api):** `DashboardGeneration` (migration
  `20261102120000_add_dashboard_generation`, applied), the
  `dashboard-generation` module (schema, errors, Prisma service with guarded
  transitions, control service + `setDispatcher`, pipeline service, feed,
  changes service, Nest module), `src/ai/dashboard-{prompt,brief,propose,review}.ts`,
  `src/trigger/generate-dashboard.ts`, `src/jobs/dashboard-generation-dispatch.ts`,
  the `dashboardGeneration` router (`start`, `byId`, `active`, `latest`,
  `cancel`, `onChange`); `onboarding.skip`, `onboarding.finish` →
  `generationId`; `assistant.recommendWidgets` and its service / ai file /
  schemas / errors removed; `describeData` exported, `recommendationCardSchema`
  → `proposalCardSchema`, `AssistantContext.payload`. Contracts:
  `dashboard-generation.api.test.ts` (33), `onboarding.api.test.ts` (24),
  `assistant.api.test.ts` (54).
- **Shipped (dashboard):** `lib/dashboard/generation.ts`, `axis.ts`,
  `format.ts` (compact, `seriesByKey`, `figureFormatter`),
  `components/common/step-list.tsx`, `use-dashboard-generation.ts`,
  `dashboard-generation-progress.tsx` (Cancel / Try again / Dismiss),
  `dashboard-panel.tsx` (pill → `start`, progress card, `noValue` empty
  state), every chart renderer (tick policy, compact dynamic axes, tooltip
  units, truncated legends), `chart.tsx` (`valueFormatter`, legend
  `formatter`), the five-hue palette + `heat-label` token, equal-height rows,
  stat compare chips; onboarding: `onboarding-name-screen`,
  `onboarding-finishing-screen`, `use-onboarding-skip`, `config/onboarding.ts`
  (`ONBOARDING_RUN_ROW_LIMIT` 10), the rewritten wizard/progress; the
  onboarding cards editor and the recommendation previews deleted. 307
  dashboard tests.
- **Verified:** lint + typecheck across the 9 workspaces; engine, dashboard
  and the three API contracts green; in the browser on the 90-row "Orders
  demo" sheet through the real local worker: the pill → progress card ticking
  from the SSE row → two attempts → an applied dashboard (a revenue stat, a
  monthly revenue line with angled ticks, revenue by region, a status donut,
  revenue by product as an auto-horizontal bar because "Add-on: analytics"
  is long) in full rows ([6,6], [6,6], [12]), compact Y ticks, no console
  errors.
- **Deviated:** the first real run showed two gaps the plan did not foresee
  and that were fixed before this outcome: the model invented a currency
  prefix ("वरुन") that the reviewer flagged as `fix` but no attempt was left
  to fix — `toGenerationCard` now keeps only real units (`unitOrNothing`:
  a currency symbol, `%`, or ≤ 3 letters) and the propose prompt says so;
  and a table split by its own grouping column (a diagonal matrix) passed
  the engine — `toGenerationCard` drops a `splitBy` equal to `groupBy` and
  the prompt forbids splitting tables. Stats default to `height "sm"`. The
  retry feedback also carries the reviewer's per-card notes, not just its
  reasons. `onboarding.finish` keeps setting the flag before the generation
  ends (a worker outage must not strand the user), and the wizard's finishing
  screen only invalidates `user.me` on `completed` or when no generation
  started; a failed generation shows an error line and a "Go to dashboard"
  button. The dashboard pill's progress card gained a Dismiss so the starter
  stays reachable after a failed run.
- **Not verified here:** the onboarding flow in the browser (it needs
  `db:reset`, which empties the shared remote database the user's eight
  workspaces live in — not run without asking); the `skip` path likewise.
  Both are covered by the onboarding contract and the dashboard tests.
- **Not done:** a "regenerate" entry point on a non-empty dashboard (the pill
  stays empty-dashboard-only, as decided); surfacing the brief and the
  reviewer's notes in the UI (stored on the row, not shown); a `generation`
  object in `onboarding.finish`'s answer so the stream can seed without a
  `latest` refetch.
- **Docs updated:** `docs/features/dashboard-generation.md` (new),
  `assistant.md`, `dashboard.md`, `onboarding.md`, `run-ai.md`, `index.md`,
  `docs/routes/root.md`, `onboarding.md`, `index.md`, `docs/rules/FRONTEND.md`,
  `ARCHITECTURE.md`, `apps/api/.env.example`.
