---
name: api-testing
description: Write or update the contract test for an API — the file that documents payloads, responses, and error codes and fully tests them. Use when adding or changing a tRPC procedure, when asked to test an API, or when the frontend needs to know an API's shape.
---

# API contract tests

Rules: [docs/rules/TESTING.md](../../../docs/rules/TESTING.md).
Reference: `apps/api/src/__tests__/note.api.test.ts` — copy it.

**An API exists when its contract test exists.** This file is both the test suite
and the API documentation the frontend reads; there is no separate API doc.

File: `apps/api/src/__tests__/<feature>.api.test.ts` — one per feature.

## 1. Contract header (write this first)

A single block comment at the top. It must be complete enough that nobody needs
to open backend source to build the UI.

```ts
/**
 * CONTRACT — thing
 * Feature doc: docs/features/thing.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `Thing`
 *   id         String    pk, uuid
 *   name       String    required, trimmed, 1..200
 *   createdAt  DateTime  now(), indexed
 *   updatedAt  DateTime  @updatedAt
 *
 * MODEL  Thing = { id: string; name: string; createdAt: Date; updatedAt: Date }
 * Dates cross the wire as real Date objects (superjson).
 *
 * PROCEDURES
 * | Procedure    | Kind     | Payload                | Response       | Errors      |
 * | ------------ | -------- | ---------------------- | -------------- | ----------- |
 * | thing.list   | query    | —                      | Thing[]        | —           |
 * | thing.create | mutation | { name: string }       | Thing          | BAD_REQUEST |
 *
 * NOTES
 * - Behaviour a shape cannot express: ordering, defaults, side effects, and the
 *   limits of what each procedure accepts.
 */
```

Every payload written here must appear as a real test input below. Every error
code here must have a test that produces it.

## 2. Setup — reuse the shared helpers

```ts
import { afterAll, describe, expect, it } from "bun:test";
import { pingDatabase } from "../db/prisma";
import { thingService } from "../modules/thing/thing.service";
import { caller, expectDate, expectTRPCError } from "./support/trpc";

const dbUp = await pingDatabase();
const createdIds: string[] = [];

async function makeThing(name: string) {
  const thing = await caller.thing.create({ name });
  createdIds.push(thing.id);
  return thing;
}

afterAll(async () => {
  for (const id of createdIds) await thingService.remove(id).catch(() => {});
});
```

Never re-declare `caller` or `expectTRPCError` in a test file — add to
`src/__tests__/support/` if a helper is missing.

## 3. One describe per procedure

```ts
describe.skipIf(!dbUp)("thing.create", () => {
  it("creates from the minimal payload", async () => { /* … */ });
  it("creates from the full payload and returns the whole model", async () => { /* … */ });
  it("rejects a blank name", async () => {
    await expectTRPCError(caller.thing.create({ name: " " }), "BAD_REQUEST");
  });
});
```

Reading the test names top to bottom must reproduce the contract table.

## 4. Required coverage, per procedure

1. Happy path with the **minimal** payload (required fields only).
2. Happy path with the **full** payload (every optional field set), asserting
   every promised field, `Date` types included.
3. One test per validation rule → `BAD_REQUEST` (blank, over-max, wrong type).
4. Missing/foreign id → `NOT_FOUND`.
5. Side effects asserted: partial update leaves other columns intact; delete
   makes the row unreadable; create is readable back.
6. Ordering for list procedures; boundaries for pagination inputs.
7. Every error code named in the header.

## 5. Rules that bite

- **No mocking the database.** Contract tests run against real Postgres through
  the tRPC caller; a mocked test proves nothing about the real payload.
- `expect(promise).rejects.toThrow(/regex/)` **hangs** against `TRPCError` in bun
  1.3.9 — always use `expectTRPCError`.
- Assert error **codes**, never message strings.
- `describe.skipIf(!dbUp)` is for a missing database only. Never skip a failing
  test to go green.
- Clean up every row the file creates; never assert on total table counts.

## 6. Run

```bash
bunx turbo test --filter=@reclit/api
cd apps/api && bun test src/__tests__/thing.api.test.ts   # single file
```

Then update `docs/features/<feature>.md` if the table or procedure list changed.
