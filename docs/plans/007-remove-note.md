# 007 — Remove the `note` feature

**Status:** implemented
**Scope:** backend (+ docs)

## Goal

Delete the `note` example CRUD slice. It existed only to demonstrate the
Postgres → Prisma → service → tRPC path; `spreadsheet` and `file` now cover that
ground with real product code, and no page ever consumed `note`.

## Backend

- **Table:** `Note` dropped. A new migration
  `prisma/migrations/20260828000000_drop_note/` runs `DROP TABLE "Note"`.
- **Deleted:** `src/modules/note/`, `src/trpc/routers/note.ts`,
  `src/__tests__/note.api.test.ts`, `docs/features/note.md`.
- **Edited:** `trpc/routers/_app.ts` (drops the `note` key — `spreadsheet` is
  now the only registered router), `prisma/schema.prisma`, `smoke.test.ts`
  (repointed at `spreadsheet.list`), plus two dangling comments in
  `common/errors.ts` and `spreadsheet.schema.ts`.
- Nothing reused was removed: `common/schema.ts`, `common/errors.ts`,
  `common/prisma-errors.ts`, `trpc/init.ts` and `__tests__/support/` are all
  generic and stay, used by `spreadsheet`.

## Frontend

None. Every "note" hit in `apps/dashboard` was the English word in the
audio-cell code ("audio note"); no note UI has existed since plan 002.

## Integration

None.

## Decisions

- **Reverses plan 002's decision** to keep the Note backend after deleting its
  UI ("the backend slice is the repo's only working procedure and its only
  test"). That reasoning expired with plan 006: `spreadsheet` is now a working,
  page-consumed, fully contract-tested slice, so `note` proves nothing that is
  not already proven.
- **A new drop migration, not a deleted one.** Removing
  `20260820004848_init_note/` would rewrite history and make Prisma report drift
  against any database that already applied it; BACKEND.md forbids editing an
  applied migration. Rejected deleting the folder.
- **`smoke.test.ts` is repointed, not trimmed.** Its `note.list` case was the
  only proof the tRPC adapter is actually mounted over HTTP — deleting it would
  have silently dropped that coverage.
- **No feature replaces `note` as the documented "example to copy".** The docs
  now describe the shape and point at `src/modules/` / `src/__tests__/`
  generally, with generic `<feature>` / `thing` placeholders in code samples
  (matching the existing `_template.md` convention and the `api-testing`
  skill's own `Thing` sample). Rejected promoting `spreadsheet` to reference
  implementation: it is four tables, a service pair and a REST controller, which
  is a poor "copy this for anything new".
- **Adjacent stale claims fixed in the same pass.** Statements sitting next to
  the note references were already wrong after plan 006 — "No page consumes it
  yet", "the tRPC client wiring is live but currently unused by any page",
  "`/` notes CRUD", and root.md's "the wiring has no consumer".

## Risks / open questions

- The dropped table held 3 rows of contract-test data. Intentional — the feature
  was never used for anything real.
- Plans 001, 002 and 006 still name `note`. Correct as written: plans are
  historical records (COMMON.md §8) and are not edited to match later work.

---

## Outcome

- **Shipped:** `note` is gone from the API, the database, the docs, and the
  agent/skill configs. `appRouter` exposes `spreadsheet` only.
- **Deviated:** the migration was written and applied by hand
  (`migrate diff` → `migrate deploy`) because `prisma migrate dev` refuses to
  run in a non-interactive shell. Same result; `migrate status` reports no drift.
- **Not done:** nothing.
- **Docs updated:** `AGENTS.md`, `ARCHITECTURE.md`, `README.md`,
  `docs/rules/{BACKEND,COMMON,TESTING}.md`, `docs/RELIABILITY.md`,
  `docs/routes/root.md`, `docs/features/index.md`,
  `.claude/agents/api-agent.md`, `.claude/skills/{backend-feature,api-testing}/SKILL.md`.
