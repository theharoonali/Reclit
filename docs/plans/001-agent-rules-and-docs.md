# 001 — Agent rules, skills, and doc structure

**Status:** implemented
**Scope:** repo (no product code)

## Goal

An agent can build a feature here without reading the whole codebase: rules that
say where code goes and what may not be duplicated, one doc per backend feature,
one test file per API that doubles as its documentation, and a three-agent
pipeline that lets the API and the UI be built at the same time.

## Backend (Agent 1)

- No new tables or procedures. Existing `note` feature documented in
  `docs/features/note.md` (table + files + procedures in one place), replacing
  `docs/generated/db-schema.md`.
- `docs/rules/BACKEND.md` gains the layer table, the five standard duplication
  sites and where their single copy lives, error naming, and the six-step
  "adding a feature" sequence.

## Frontend (Agent 2)

- `docs/rules/FRONTEND.md` gains the target folder structure
  (`components/{layout,common,<feature>}`, `config/nav.ts`, `hooks/`, `lib/`),
  the four-file chrome rule, the reuse ladder, shadcn placement in
  `packages/ui`, and the rule that every global (colour, radius, font,
  animation) lives in `packages/ui` and nowhere else.
- `docs/FRONTEND.md` folded into it — it was a second description of the same
  thing.

## Testing

- `apps/api/src/__tests__/<feature>.api.test.ts` is the contract: a header
  documenting table, model, payloads, responses, and error codes, plus full
  coverage of all of it. `note.test.ts` rewritten as `note.api.test.ts` in that
  shape; helpers extracted to `__tests__/support/trpc.ts`.

## Decisions

- **The contract lives in the test file, not a doc.** A doc drifts; a test fails.
  Feature docs link to it rather than repeating payloads — one fact, one place.
- **Feature docs are per backend feature, not per layer.** Everything about
  `note` — table, service, router, procedures — is in `docs/features/note.md`.
  Rejected: separate schema/service/API doc trees, which force three reads.
- **Route docs stay separate from feature docs.** A page and a feature are not
  one-to-one, and the frontend agent needs the page map, not the service map.
- **Two agents in parallel, split by file ownership** (`apps/api` vs
  `apps/dashboard` + `packages`) — the boundary is what makes the parallel run
  safe. Integration is a third agent so that neither builder is tempted to edit
  the other's half.
- **Deleted rather than added:** `docs/FRONTEND.md`,
  `docs/generated/db-schema.md`, and the `new-trpc-router` skill (absorbed by
  `backend-feature`). Every one was a second copy of something.

## Risks / open questions

- The frontend structure is prescriptive but not yet built: the dashboard has no
  `(app)` route group, no `components/layout/`, `common/`, or `config/nav.ts`,
  and `notes-panel.tsx` still sits at the root of `components/`. The first
  feature that adds a second page should create the chrome and move the panel to
  `components/note/`.
- `docs/rules/TESTING.md` has an empty "Exceptional cases" section by design; it
  fills up as edge cases are found.

---

## Outcome

- **Shipped:**
  - Rules: `docs/rules/{COMMON,BACKEND,FRONTEND,TESTING,WORKFLOW}.md`
  - Feature docs: `docs/features/{index,_template,note}.md`
  - Plans: `docs/plans/_template.md` + this file
  - Contract test: `apps/api/src/__tests__/note.api.test.ts` (16 tests, green)
    and `apps/api/src/__tests__/support/trpc.ts`
  - Skills: `backend-feature`, `frontend-feature`, `api-testing`,
    `feature-workflow`
  - Subagents: `api-agent`, `ui-agent`, `integration-agent`
  - Updated: `AGENTS.md`, `README.md`, `docs/RELIABILITY.md`,
    `docs/routes/{index,_template,root}.md`
  - Deleted: `docs/FRONTEND.md`, `docs/generated/db-schema.md`,
    `.claude/skills/new-trpc-router/`, `apps/api/src/__tests__/note.test.ts`
- **Deviated:** this plan was written after the change rather than before it —
  it is the seed example for the convention it describes.
- **Not done:** no frontend code was written. The chrome, `components/common/`,
  and `config/nav.ts` described in the frontend rules do not exist yet.
- **Verified:** `bunx turbo lint typecheck test` green across all workspaces.
