# Testing Rules

Shared rules: [COMMON.md](COMMON.md).

The core rule: **an API exists when its contract test exists.** The contract test
file is simultaneously the test suite *and* the API documentation the frontend
reads. There is no separate "API docs" page to drift out of sync.

```bash
bunx turbo test                      # everything
bun run --filter=@reclit/api test    # api only
bun test src/__tests__/note.api.test.ts   # one file (from apps/api)
```

## The three test kinds

| Kind | File | Covers |
| --- | --- | --- |
| **Contract** | `apps/api/src/__tests__/<feature>.api.test.ts` | every procedure of one feature: payload, response, errors. **This is the API doc.** |
| **Smoke** | `apps/api/src/__tests__/smoke.test.ts` | the app boots, `/health` answers, tRPC is mounted. One file, repo-wide. |
| **Unit** | next to the code, `<name>.test.ts` | a pure helper with real branching logic. Only when the contract test cannot reach it. |

No mocking of the database. Contract tests run against a real Postgres through a
tRPC caller — a mocked test proves nothing about the payload the frontend will
actually receive.

## Contract test file — required shape

Every feature file has exactly these four parts, in this order.

### 1. The contract header

A single block comment at the top of the file. This is what the frontend and the
integration agent read; it must be complete enough that **nobody needs to open
backend source to build the UI**.

```ts
/**
 * CONTRACT — note
 * Feature doc: docs/features/note.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `Note`
 *   id         String    pk, uuid
 *   title      String    required, trimmed, 1..200
 *   content    String    default ""
 *   createdAt  DateTime  now(), indexed
 *   updatedAt  DateTime  @updatedAt
 *
 * MODEL  Note = {
 *   id: string; title: string; content: string;
 *   createdAt: Date; updatedAt: Date;
 * }
 * Dates cross the wire as real Date objects (superjson).
 *
 * PROCEDURES
 * | Procedure     | Kind     | Payload                       | Response          | Errors               |
 * | ------------- | -------- | ----------------------------- | ----------------- | -------------------- |
 * | note.list     | query    | —                             | Note[], newest 1st| —                    |
 * | note.byId     | query    | { id: string }                | Note              | NOT_FOUND            |
 * | note.create   | mutation | { title: string; content?: s }| Note              | BAD_REQUEST          |
 * | note.update   | mutation | { id; title?; content? }      | Note              | BAD_REQUEST NOT_FOUND|
 * | note.remove   | mutation | { id: string }                | { id: string }    | NOT_FOUND            |
 *
 * NOTES
 * - Partial update leaves omitted fields untouched.
 * - `note.list` returns every row: no pagination, search, or sort input.
 * - Every procedure is public; there is no auth yet.
 */
```

Required, per procedure: name, kind, the **exact payload shape**, the **exact
response shape**, and every error code it can return. `NOTES` records the
behaviour a shape cannot express — ordering, defaults, side effects, and the
limits of what the procedure accepts.

### 2. Setup

Helpers come from `src/__tests__/support/` — never re-declared per file
([BACKEND.md](BACKEND.md), "No repetition"). A contract file's own setup is
limited to its caller, its fixtures, and its cleanup.

### 3. Tests, grouped per procedure

One `describe` per procedure, named exactly as the procedure. Reading the test
names top to bottom must reproduce the contract table.

### 4. Cleanup

`afterAll` removes every row the file created. Tests never depend on rows left by
another file or a previous run, and never assert on total table counts.

## Required coverage

A procedure is not covered until all of these exist that apply to it:

1. **Happy path, minimal payload** — only required fields.
2. **Happy path, full payload** — every optional field set.
3. **One test per validation rule** in the schema → `BAD_REQUEST`
   (empty/blank required string, over-max length, wrong type).
4. **Missing or foreign id** → `NOT_FOUND`.
5. **Side effects asserted, not assumed** — a partial update leaves other
   columns intact; a delete makes the row unreadable; a create is readable back.
6. **List shape** — ordering asserted for any list procedure; pagination
   boundaries when it takes them.
7. **Every error code named in the contract header** has a test that produces it.

Every payload written in the header must appear as a real test input somewhere in
the file. If the header says a field is optional, one test omits it and one
supplies it.

## Assertions

- Assert the **shape**, not just that a call succeeded: check every field the
  contract promises, including types of `Date` fields.
- Assert error **codes**, never error message strings.
- `expect(promise).rejects.toThrow(/regex/)` **hangs** against `TRPCError`
  rejections in bun 1.3.9. Use `expectTRPCError` from
  `src/__tests__/support/trpc.ts`, which catches and asserts on `error.code`.

## Environment

- Contract tests need a reachable `DATABASE_URL`. They **skip** (via
  `describe.skipIf(!dbUp)`) rather than fail when the database is unreachable, so
  a fresh checkout still passes CI.
- Skipping is for a missing database only. Never `skip` a failing test to make
  the suite green — fix it or delete it.
- `db:generate` runs automatically before `test` (a Turbo dependency).

## Frontend tests

The dashboard has no test suite yet; its `test` script no-ops until a
`*.test.ts` exists. When one is added, the rules are:

- Test behaviour through the rendered component, not implementation details.
- Never re-assert an API contract in the frontend — that is the contract test's
  job. Mock at the tRPC boundary using shapes copied from the contract header.
- Chrome, tokens, and pure layout are not unit-tested. Verify them in the browser.

## Exceptional cases

Edge cases that are found in review or production get added here and to the
feature's contract test as a named test, so the same class of bug cannot return.

*(none recorded yet)*
