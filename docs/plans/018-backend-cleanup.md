# 018 — Backend structure cleanup

**Status:** implemented
**Scope:** backend

## Goal

Nothing changes for a user. `apps/api` keeps every procedure, route, error
code and test, but the code repeats nothing the rules forbid, no file holds two
responsibilities, the seed script typechecks, and the backend docs describe the
code as it is — each fact in one place.

## Backend (Agent 1)

- **Table(s):** none. No migration, no schema change.
- **Procedures:** none added, removed or reshaped. `RouterInputs` /
  `RouterOutputs` are byte-for-byte the same.
- **Service methods:**
  - `RunAiService` keeps the run lifecycle; the live stream (`changes`,
    `snapshot`, the feed pump) moves to `RunAiChangesService`
    (`run-ai-changes.service.ts`). `find(id)` becomes public and `getOrThrow`
    is built on it.
  - `SpreadsheetCellsService` gains module-level write builders (`rowData`,
    `cellData`, `upsertRow`, `writeCell`, `nextRowIndex`) and a private
    `assertWritable`; `spreadsheet.shape.ts` gains `toSheetCell` and loses
    `assembleRows`.
  - `SpreadsheetImportService.replaceAll` returns the wire `columns`.
- **Shared helpers:** `toJsonInput` (`src/db/prisma.ts`); `describeError` used
  everywhere an error is reduced to text; `startTestServer` + `jsonInit`
  (`__tests__/support/http.ts`); `expectError` (`__tests__/support/trpc.ts`).
- **Fixed:** `prisma/seed.ts` called `createColumn` on the cells service; the
  seed is now inside `tsconfig` `include`.
- **Removed:** dead exports in `run-ai.schema.ts` and `spreadsheet.schema.ts`,
  the unused `@api/*` path alias, twelve copies of the same header comment.

## Frontend (Agent 2)

- None.

## Integration (Agent 3)

- None. The dashboard imports types only; every type it reads is unchanged.

## Decisions

- **Split by responsibility, not by size alone.** `run-ai.service.ts` held the
  run lifecycle and the SSE stream; the stream is its own service, the way
  the spreadsheet's cell, column and import writes are. The router is the only
  caller that changed.
- **Record types come from Prisma** (`Prisma.<Model>GetPayload<{ select }>`),
  never hand-written to mirror a `select`. `spreadsheet.shape.ts` keeps its own
  `ColumnRecord` / `CellRecord`: that file is deliberately prisma-free and its
  `type: string` is what lets the import inference reuse it.
- **Contract NOTES vs feature-doc Behaviour.** The contract header owns
  wire-observable behaviour (what a client sees); the feature doc owns internal
  invariants (transactions, hooks, service-held invariants). The template and
  TESTING.md now say so, and `run-ai.md` / `spreadsheet.md` were pruned to it.
- **Kept `.catch(mapDomainError)` per procedure** over a tRPC middleware: it is
  the codified pattern and a middleware cannot catch inside a subscription
  generator after its first yield.
- **Controller param bag.** `@Param() params` + `schema.parse({ ...body,
  ...params })` replaces one decorator per path segment; zod strips unknown
  keys, so the parsed input is identical.
- **Left alone:** `rxjs` and `reflect-metadata` (NestJS peers), `@types/bun:
  latest` (a dependency edit needs `bun install`), `spreadsheet-import.parse.ts`'s
  own fallback message (not `describeError`'s).

## Risks / open questions

- None functional. The stream split changes only which singleton the router
  calls; the contract suite drives the whole stream through the router.

---

## Outcome

- **Shipped:** everything above. `modules/run-ai/run-ai-changes.service.ts`
  (new), `run-ai.service.ts` (lifecycle only), `run-ai.schema.ts`,
  `run-ai.feed.ts`, `run-ai.module.ts`, `trpc/routers/run-ai.ts`;
  `modules/spreadsheet/{spreadsheet.service,spreadsheet-cells.service,spreadsheet-import.service,spreadsheet.shape,spreadsheet.schema,spreadsheet.controller}.ts`;
  `modules/{file,workspace}/*.service.ts`; `db/prisma.ts` (`toJsonInput`);
  `ai/cell-attachments.ts`; `__tests__/support/{http,trpc}.ts` and the three
  suites that booted a server by hand; `prisma/seed.ts`; `tsconfig.json`;
  `trigger.config.ts`.
- **Deviated:** the run-ai transition helper is `resultAndCredit` (used by
  `create` too), and `RunAiService.latestEventId` was added so the changes
  service never touches `prisma` for the snapshot id. `RunAiService` has no
  `getOrThrow`: `byId` is the throwing read, built on the public `find`.
- **Not done:** pinning `@types/bun`; a tRPC error middleware (rejected, see
  Decisions).
- **Docs updated:** `docs/rules/BACKEND.md`, `docs/rules/TESTING.md`,
  `docs/features/_template.md`, `docs/features/run-ai.md`,
  `docs/features/spreadsheet.md`, `ARCHITECTURE.md`, `AGENTS.md`,
  `docs/SECURITY.md`, `docs/RELIABILITY.md`,
  `.claude/skills/backend-feature/SKILL.md`.
