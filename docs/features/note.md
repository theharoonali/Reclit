# `note`

**Purpose:** Notes CRUD. The reference backend feature — copy
`apps/api/src/modules/note/` for anything new.

**Contract:** `apps/api/src/__tests__/note.api.test.ts` — payloads, responses,
and error codes live in its header. This doc does not repeat them.

## Table `Note`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `title` | `String` | required; trimmed, 1..200 at the schema |
| `content` | `String` | `@default("")`; max 10 000 at the schema |
| `createdAt` | `DateTime` | `@default(now())`, indexed |
| `updatedAt` | `DateTime` | `@updatedAt` |

Indexes: `Note_createdAt_idx` on `createdAt` — the list query sorts by it.
Relations: none. Migrations: `apps/api/prisma/migrations/`.

Provider: PostgreSQL. Client: Prisma 7 with the `@prisma/adapter-pg` driver
adapter, generated to `apps/api/generated/prisma` (gitignored), instantiated once
in `apps/api/src/db/prisma.ts`.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | the `Note` model |
| `apps/api/src/modules/note/note.schema.ts` | schema | `noteSchema`, `createNoteInput`, `updateNoteInput`, `noteIdInput` + inferred types |
| `apps/api/src/modules/note/note.service.ts` | service | `NoteService` (all DB access), the `noteService` singleton, `NoteNotFoundError`, the `noteSelect` projection |
| `apps/api/src/trpc/routers/note.ts` | router | the five procedures; maps `NoteNotFoundError` → `TRPCError` |
| `apps/api/src/trpc/routers/_app.ts` | registry | mounts `noteRouter` as `note` |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `note.list` | query | `NoteService.list` | — |
| `note.byId` | query | `NoteService.byId` | `NOT_FOUND` |
| `note.create` | mutation | `NoteService.create` | `BAD_REQUEST` |
| `note.update` | mutation | `NoteService.update` | `BAD_REQUEST`, `NOT_FOUND` |
| `note.remove` | mutation | `NoteService.remove` | `NOT_FOUND` |

## Behaviour

- `list` returns every row, newest first. No pagination, search, or sort input.
- `title` is required and trimmed; a blank title is `BAD_REQUEST`.
- `update` is partial: omitted fields keep their stored value. The update schema
  is built from **undefaulted** fields on purpose — `createNoteInput.partial()`
  would carry `content`'s `.default("")` and blank the column on a title-only
  update.
- `byId` on a missing id is `NOT_FOUND`; `update`/`remove` map Prisma `P2025` to
  the same code.
- Every procedure is `publicProcedure`. `Note` has no user column — there is no
  auth yet.
- Dates cross the wire as real `Date` objects (superjson transformer).

## Reusable pieces

- `noteSelect` — the one projection every method uses; what the API returns is
  decided there, not by the Prisma model.
- `NoteService` — the decorator-free service pattern the tRPC router can import.
- `NoteNotFoundError` + `toTRPCError` — the domain-error-to-transport mapping.
- `pingDatabase` (`src/db/prisma.ts`) — reuse for any readiness probe.

## Used by

- `/` ([root.md](../routes/root.md)) — calls `list`, `create`, `update`, `remove`.
  `byId` is not called by any page; it exists for direct callers and tests.
