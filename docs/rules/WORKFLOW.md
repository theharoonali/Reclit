# Feature Workflow

How a feature gets built here. Rules: [COMMON.md](COMMON.md) ·
[BACKEND.md](BACKEND.md) · [FRONTEND.md](FRONTEND.md) · [TESTING.md](TESTING.md).

A feature is built by three agents. Two run **in parallel**, the third joins them.
The contract test is the seam that lets that happen.

```
        ┌─ Agent 1: API ──────────────────────────────┐
plan ──▶│ schema → service → router → contract test    │──┐
        └─────────────────────────────────────────────┘  │
        ┌─ Agent 2: UI ───────────────────────────────┐  ├──▶ Agent 3: Integration ──▶ done
        │ components, states, chrome — no API calls    │──┘     wire contract → UI
        └─────────────────────────────────────────────┘
```

## Step 0 — the plan (always first)

Write `docs/plans/NNN-<slug>.md` from
[`_template.md`](../plans/_template.md) **before any code**. It names the
procedures, the table, the screens, and which agent owns what. Commit it.

A plan that never gets implemented stays on disk with `Status: planned`.

## Agent 1 — API

**Owns:** `apps/api/**`, `apps/api/prisma/**`, `docs/features/**`.

1. Prisma model + migration.
2. `modules/<feature>/<feature>.schema.ts` → `<feature>.service.ts`.
3. `trpc/routers/<feature>.ts`, registered in `_app.ts`.
4. `__tests__/<feature>.api.test.ts` — contract header + full coverage
   ([TESTING.md](TESTING.md)).
5. `docs/features/<feature>.md` + a row in `docs/features/index.md`.

**Done when** `bunx turbo test --filter=@reclit/api` is green and every procedure
in the contract header has passing tests. The API is then **final**: shapes do not
change after this point without a new plan entry and a contract-test update in the
same commit.

Skill: `backend-feature`. Subagent: `api-agent`.

## Agent 2 — UI (runs at the same time)

**Owns:** `apps/dashboard/**`, `packages/ui/**`, `docs/routes/**`.

Builds the screens from the plan, **without calling any API**:

1. Reuse first — `packages/ui`, then `components/common/`
   ([FRONTEND.md](FRONTEND.md)).
2. Components take **props**, not queries: `items`, `isLoading`, `error`,
   `onCreate`, `onUpdate`, `onDelete`. Render from local fixture data typed to the
   shapes in the plan.
3. All three states are built: loading, error, empty.
4. Chrome (`components/layout/`, `config/nav.ts`) and tokens are updated here if
   the feature needs a nav entry or a new token.
5. Route doc in `docs/routes/`, with the "APIs called" table filled from the plan.

**Done when** the page renders end to end from fixtures, lint and typecheck pass,
and no component contains a `useQuery`/`useMutation` for this feature.

Skill: `frontend-feature`. Subagent: `ui-agent`.

## Agent 3 — Integration

**Owns:** the wiring only — the feature's container component and the page.

1. Read **only** the contract header of
   `apps/api/src/__tests__/<feature>.api.test.ts`. Not the service, not the router.
2. Replace the fixture with `useQuery`/`useMutation`, prefetch on the server where
   the page is dynamic, invalidate the affected query after every mutation.
3. Types come from `RouterInputs`/`RouterOutputs` — delete any fixture types the
   UI agent introduced.
4. Reconcile mismatches **in the UI**, never by changing the API. If the contract
   genuinely cannot serve the screen, stop and record it in the plan; a contract
   change is a new Agent-1 task.
5. Verify in the browser: create, read, update, delete for real.
6. Update the route doc and the plan's `Outcome`.

**Done when** `bunx turbo lint typecheck test` passes and the real round trip
works in the browser.

Subagent: `integration-agent`.

## Rules for running them

- **Agents 1 and 2 never touch each other's files.** That is what makes the
  parallel run safe; a conflict means someone crossed a boundary.
- Agent 2 must not block on Agent 1. If a shape is unknown, it comes from the
  plan, and the plan is what gets corrected.
- Agent 3 starts only after Agent 1 reports green tests.
- Agents 1 and 2 each report: files touched, decisions taken, anything that
  deviated from the plan.

## When not to use three agents

| Change | Do this instead |
| --- | --- |
| backend only (new procedure, no UI) | Agent 1 alone, plus the route doc if a page's API table changes |
| UI only (restyle, new state, chrome) | Agent 2 alone |
| one-file fix | no plan, no agents — just the fix, plus any doc it invalidates |

The plan file is still written for anything larger than a one-file edit.
