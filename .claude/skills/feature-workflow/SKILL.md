---
name: feature-workflow
description: Run the three-agent feature pipeline — plan, then API+contract-test and UI in parallel, then integration. Use when the user asks to build a whole feature end to end (database through screen), or names the workflow.
---

# Three-agent feature pipeline

Rules: [docs/rules/WORKFLOW.md](../../../docs/rules/WORKFLOW.md).

```
plan ──▶ Agent 1 API  ──┐
     └─▶ Agent 2 UI   ──┴──▶ Agent 3 Integration ──▶ done
         (in parallel)
```

The contract test is the seam: the API agent writes it, the integration agent
reads it, and the UI agent never waits on either.

## Step 0 — plan (you, before launching anything)

Write `docs/plans/NNN-<slug>.md` from `docs/plans/_template.md`, filling in:
procedures with payload/response, table columns, routes and components, and who
owns what. Take the next free `NNN`. Show the user the plan before proceeding if
anything is ambiguous.

The plan is the shared source of truth while the two agents run — the UI agent
builds against the shapes written there.

## Step 1 — launch Agents 1 and 2 in parallel

Both in a **single message, two Agent tool calls**:

- `api-agent` — the backend and its contract test.
- `ui-agent` — the screens, from fixtures, with no API calls.

Give each: the plan path, the feature name, and its file boundaries.

**Boundaries (never crossed):**

| Agent | Owns |
| --- | --- |
| api-agent | `apps/api/**`, `docs/features/**` |
| ui-agent | `apps/dashboard/**`, `packages/ui/**`, `docs/routes/**` |

A merge conflict between them means someone crossed a boundary — fix the
boundary, not the file.

## Step 2 — gate

Do not start integration until the api-agent reports:
`bunx turbo test --filter=@reclit/api` green, with every planned procedure in the
contract header. If the UI agent is still working, wait — integration edits its
files.

## Step 3 — integration

Launch `integration-agent` with the contract test path and the component paths.
It reads **only** the contract header, replaces fixtures with real queries and
mutations, and verifies the round trip in the browser.

Mismatches are reconciled in the UI. A contract change is a new api-agent task
plus a plan entry — never an ad-hoc edit to the API.

## Step 4 — close out

1. `bunx turbo lint typecheck test`
2. Fill in the plan's `Outcome` section: shipped, deviated, not done, docs updated.
3. Confirm `docs/features/<feature>.md` and the route doc match the code.

## When to skip the pipeline

| Change | Do |
| --- | --- |
| backend only | `backend-feature` skill directly |
| UI only | `frontend-feature` skill directly |
| one-file fix | just fix it, plus any doc it invalidates |
