# 044 — Table consolidation and a vendor-neutral AI layer

**Status:** shipped (backend); Settings tabs split off
**Scope:** backend refactor (no wire change but `RunAi.credit`)

## Goal

Fewer tables, less bookkeeping, same behaviour. 15 tables → 10:

- `RunAi`, `AssistantRun`, `DashboardGeneration` → one **`AiRun`** with
  `kind` (`CELL` | `ASSISTANT` | `DASHBOARD`). Onboarding's AI already rides
  on cell runs plus a `DASHBOARD` run with source `ONBOARDING`.
- `CompanyPage` dropped — its markdown was never read back; `pageCount` on
  the profile replaces it.
- `Dashboard` folded into `Workspace` (`dashboardCreatedAt`,
  `dashboardTitle`, `dashboardDescription`); `DashboardWidget.workspaceId`.
- `Company` folded into `User` (one profile per user); `CompanyDocument.userId`.
- Dead columns: `RunAi.credit` (never written outside tests).

And no AI vendor name outside the one provider file: `ai/gemini.ts` →
`ai/model.ts`, `ai/gemini-cache.ts` → `ai/prompt-cache.ts`,
`geminiCache*` → `promptCache*`, env `AI_API_KEY` / `AI_MODEL`.

## Backend

- Migration `20261103180000_consolidate_tables` (hand-written; copies every
  row before dropping anything):
  - `AiRun` + per-kind `CHECK`, data copy (ids kept), per-kind partial
    unique indexes (one active run per cell / per workspace for each of
    assistant and dashboard), one `ai_run_notify` trigger that keeps the
    three existing channel names via `CASE kind`, and an
    `ai_run_spreadsheet_cascade` trigger replacing the old spreadsheet FK
    for workspace-level runs (cell runs outlive their sheet, as before).
  - Workspace dashboard columns, widget `workspaceId`, drop `Dashboard`.
  - User company columns (`companyName`, `companyWebsite`, … ,
    `pageCount`, `promptCache*`, `companyUpdatedAt`), document `userId`,
    drop `CompanyPage` and `Company`; `company_changed` now fires from User
    only when `companyUpdatedAt` moves.
- Services keep their wire shapes: every `prisma.aiRun` query carries its
  `kind`; `Company.id` is the user id; `DashboardDetail.id` is the
  workspace id.
- Live feeds, `*-changes.service.ts`, routers and the dashboard are untouched.

## Frontend

Settings becomes route-based tabs: `/settings/{profile,company,subscription}`
(split off as its own task).

## Decisions

- One table with nullable per-kind columns guarded by a `CHECK`, not three
  tables with a shared parent: the lifecycles (status text, terminal set,
  trigger-run id) are the same shape and the services already map rows to
  wire types.
- Keep the three NOTIFY channel names so the feed code does not change.
- `AiRun.spreadsheetId` has no FK — cell runs must outlive their sheet
  (contract tests create runs for sheets that do not exist).
- `AI_API_KEY` falls back to `GOOGLE_GENERATIVE_AI_API_KEY` so existing
  environments keep working.

## Risks

- A query missing its `kind` filter mixes run types — every call spreads a
  per-service `KIND`.
- The migration is destructive on the shared remote database: back up first,
  stop the Trigger.dev worker while deploying.

---

## Outcome

Shipped as planned. Migration `20261103180000_consolidate_tables` applied to
the shared database (`migrate diff` against the schema is empty); the copy
kept every row (45 cell runs, 1 dashboard run, 3 widgets, the profile with
its 25-page count).

- `AiRun` + `src/common/ai-run.ts` (`present`); the run-ai, assistant and
  dashboard-generation services spread a `KIND` into every query. Feeds,
  changes services and routers unchanged.
- Dashboard on Workspace: `dashboard.shape.ts` maps the workspace columns;
  `ensureDashboard` / `written` in `dashboard.service.ts` replace the upserts.
- Company on User: `companyData` / `writeCompany` in `company.service.ts`
  are the only profile writers and always move `companyUpdatedAt`;
  `savePages` only records `pageCount`.
- `ai/model.ts` (`aiModel`, `defaultModelId`, `isAiConfigured`,
  `webSearchTools`, `webSearchQueries`, `cachedContentOptions`,
  `promptCacheApi`, `AI_KEY_ENV`) and `ai/prompt-cache.ts`; the contracts
  toggle the key through `__tests__/support/ai-key.ts`.

Deviations:

- `AI_API_KEY` falls back to the provider SDK's own variable (kept in
  `turbo.json` too) so existing `.env` files and worker environments work.
- `credit` also left the two dashboard test fixtures that built a `RunAi`.

Verified: `bunx turbo lint typecheck` clean; every api test file run alone
passes (skips are the no-database / no-storage suites); dashboard tests
339 pass. In the preview: `/settings` loads the profile from the user row
and a use-case toggle survives a reload; the dashboard renders its migrated
widgets with no console errors. Not verified live: a cell run and an
assistant run through the Trigger.dev worker (worker not running) — covered
by the run-ai and assistant contracts.
