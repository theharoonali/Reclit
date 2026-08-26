# Common Rules

The rules both apps obey. Backend-only rules: [BACKEND.md](BACKEND.md).
Frontend-only: [FRONTEND.md](FRONTEND.md). Tests: [TESTING.md](TESTING.md).
How a feature gets built end to end: [WORKFLOW.md](WORKFLOW.md).

## 1. Read before you write

Read in this order, and stop as soon as you have what you need:

| You are… | Read |
| --- | --- |
| adding/altering backend code | the feature doc in [`docs/features/`](../features/index.md) |
| building UI that calls an API | **only** the contract header of `apps/api/src/__tests__/<feature>.api.test.ts` |
| touching a page | its route doc in [`docs/routes/`](../routes/index.md) |
| starting any feature | [WORKFLOW.md](WORKFLOW.md) |

Open code only when the doc is insufficient — then fix the doc in the same change.

## 2. Don't guess — ask

Inventing a fact is a defect, exactly like a failing test. **Hallucination is
prohibited in this repository.** If you do not know something, you do not write
it — you look it up, or you ask.

| Unknown | Do this |
| --- | --- |
| a file path, export, or function name | open it or `grep` for it — never infer it from a naming convention |
| an API payload or response shape | read the contract header of `apps/api/src/__tests__/<feature>.api.test.ts` |
| a dependency version | read the `package.json`, or let the installer write it — never hand-write a version string |
| an icon, token, or component name | confirm it exists in the package that exports it before importing it |
| what the user actually wants | **ask the user** |

- **Ask rather than assume.** A question costs one message; a wrong assumption
  costs a rewrite. When two readings of a request lead to materially different
  code, stop and ask before writing any of it.
- **Never describe code you have not opened.** If a summary covers a file you
  did not read, say which one and that you did not read it.
- **Never invent a plausible-looking fact** — a version number, a route, a
  procedure name, an option flag. A confident wrong path is worse than an
  admitted gap, because the next agent trusts it.
- **State assumptions where they can be checked** — in the plan's `Decisions`,
  or inline in the change.
- "I don't know" and "I have not read that file" are correct, expected answers.
  Guessing is not.

## 3. Types

1. **Zod schemas are the single source of truth.** Every feature declares its
   shapes in `apps/api/src/modules/<feature>/<feature>.schema.ts`.
2. Backend types come from `z.infer<typeof schema>`. Never hand-write an
   interface that mirrors a schema.
3. Frontend types come from `RouterInputs` / `RouterOutputs`
   (`@reclit/api/trpc/routers/_app`). Never re-declare a shape the API already
   describes.
   ```ts
   type Note = RouterOutputs["note"]["list"][number];
   ```
4. **Prisma model types never cross the tRPC boundary.** Services select explicit
   fields and declare a schema-inferred return type. If `@prisma/client` types
   reach the dashboard, that rule was broken.
5. The dashboard imports API code **type-only**. Never import API runtime code.
6. No `as any` to silence a real type error. No `@ts-expect-error` without a
   one-line reason on the same line.

## 4. Don't repeat yourself — the reuse ladder

Applies to components, services, schemas, helpers, and test fixtures alike.
Before writing anything new, search for it. Then climb this ladder:

1. **It exists** → use it.
2. **It nearly exists** → extend it with a prop, a variant, or an optional
   argument. Never fork, never copy-paste-and-tweak.
3. **Two consumers in the same app** → move it to that app's shared folder
   (`components/common/`, `src/lib/`, `src/common/`).
4. **Two apps** → move it to `packages/ui` (or a new package via the
   `new-package` skill).

Third occurrence of any literal, select map, error mapping, or JSX block is a
bug. Extract at the second.

## 5. Size and shape

| Unit | Cap | Split when |
| --- | --- | --- |
| React component file | ~150 lines | it renders two unrelated regions, or mixes fetching with presentation |
| Service method | ~40 lines | it does two writes, or branches on a mode flag |
| Any file | ~250 lines | it holds more than one responsibility |

Caps are a smell test, not a lint rule. A 160-line file that does exactly one
thing is fine; a 90-line file doing three things is not.

## 6. Naming

- Files and folders: `kebab-case`. Types and classes: `PascalCase`.
  Variables and functions: `camelCase`. Constants: `SCREAMING_SNAKE`.
- A feature uses **one** name everywhere, singular:
  `note` → `note.schema.ts`, `note.service.ts`, `noteRouter`, `NoteService`,
  `docs/features/note.md`, `note.api.test.ts`, `components/note/note-list.tsx`.
- Booleans read as predicates: `isLoading`, `hasAccess`, `canEdit`.
- Handlers: `handleX` inside a component, `onX` as a prop.
- No abbreviations that aren't already repo vocabulary (`db`, `api`, `ui` are).

## 7. Documentation

Docs exist so an agent can act without reading the whole codebase. Four kinds,
and **nothing else**:

| Doc | One per | Holds |
| --- | --- | --- |
| [`docs/features/<feature>.md`](../features/index.md) | backend feature | its table, service, router, procedures — everything about that feature in one place |
| [`docs/routes/<route>.md`](../routes/index.md) | page | the files and APIs behind that page |
| [`docs/plans/NNN-<slug>.md`](../plans/) | change | the plan before, the outcome after |
| `docs/rules/*.md`, `ARCHITECTURE.md` | repo | how to work here |

Rules:

- **A doc changes in the same commit as the code it describes.** A stale doc is
  worse than no doc.
- Docs describe the code **as it is now** — no changelogs, no dated entries, no
  "previously", no done/not-done checklists. The exception is `docs/plans/`,
  which is explicitly a record.
- Every fact lives in exactly one doc; everywhere else links to it. If you are
  about to paste a payload shape into a second file, link the contract instead.
- Write tables and paths, not prose. If a sentence doesn't change what an agent
  would do, delete it.
- No new top-level doc without deleting one, or a rule saying why it must exist.

## 8. Plans

Every change larger than a one-file edit gets a plan file, **written before the
code**:

`docs/plans/NNN-<slug>.md` — copy [`_template.md`](../plans/_template.md).
`NNN` is the next free 3-digit number.

### A plan covers a work stream, not a prompt

**A new prompt is not a new plan.** Follow-up instructions that refine, correct
or extend the work you are already doing belong in the plan you are already in —
update it. Reaching for a new `NNN` on every message shreds one piece of work
across a directory of near-empty files and makes the decisions impossible to
follow.

| Situation | Do |
| --- | --- |
| the user adjusts, corrects, or extends the current work | **update the current plan** |
| the user changes their mind about a decision already recorded | **update that decision in place**, and say what it is now |
| the work is a genuinely different stream — new feature, new surface, unrelated fix | new `NNN` |

### Keep the plan readable

A plan is a document someone reads to understand the work, not an append-only
log. While the work is open you may **edit and prune it**:

- Delete detail that no longer means anything — a decision that was reversed
  before it shipped, a risk that never materialised, a file list that changed.
  Superseded noise makes the real decisions harder to find.
- Rewrite a `Decisions` entry when the decision changes; the current answer is
  what matters, not the sequence of answers.
- Keep what a reader a year from now still needs: what was built, why this way,
  what was deliberately left out.

Two things survive pruning:

- **Deviations between the plan and what shipped** — record them in `Outcome`.
  Never silently rewrite the plan so it matches the code.
- **A plan that was never implemented** stays with `Status: planned`. It is a
  record of a decision, not garbage to clean up.

Once a plan is `implemented` and the work is closed, it is history: leave it
alone and open a new one. Plans are the only place history lives; everything
else describes the present.

## 9. Definition of done

A change is not done until all of these pass:

```bash
bunx turbo lint typecheck
bunx turbo test
```

1. Lint, typecheck, and tests pass.
2. Every new or changed procedure is covered in its `*.api.test.ts` contract
   ([TESTING.md](TESTING.md)).
3. The feature doc, route doc, and plan `Outcome` are updated in this change.
4. `bun run format` has been run.
