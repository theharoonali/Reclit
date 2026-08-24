# `/`

**Purpose:** Notes CRUD. The reference vertical slice — Next.js → tRPC → NestJS
service → Prisma → Postgres. Copy this shape for new features.

**Rendering:** dynamic (`export const dynamic = "force-dynamic"`). It reads live
database rows, so it must not be prerendered at build time.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/page.tsx` | RSC | Page framing; server-prefetches `note.list` and wraps the panel in `HydrateClient` |
| `apps/dashboard/src/components/notes-panel.tsx` | client | The whole CRUD UI: **one** form serving create *and* edit (`editing` unset = create, set = edit), the notes list, per-row Edit/Delete. Calls all four mutations/queries |
| `apps/dashboard/src/app/layout.tsx` | RSC | Root layout: Geist fonts, `Providers` |
| `apps/dashboard/src/app/providers.tsx` | client | `TRPCReactProvider` + `next-themes` |

`@reclit/ui` usage: `Button` (the package's only component); everything else is
plain markup + Tailwind tokens.

## Backend files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `Note` model + migrations |
| `apps/api/src/db/prisma.ts` | client | Prisma singleton, `disconnectPrisma`, `pingDatabase` |
| `apps/api/src/modules/note/note.schema.ts` | schema | `noteSchema`, `createNoteInput`, `updateNoteInput`, `noteIdInput` |
| `apps/api/src/modules/note/note.service.ts` | service | `NoteService` (all DB access) + `noteService` singleton + `NoteNotFoundError` |
| `apps/api/src/trpc/routers/note.ts` | router | The five procedures below; maps `NoteNotFoundError` → `TRPCError` |

## APIs called

| Procedure | Type | Input | Output | Service method | Table |
| --- | --- | --- | --- | --- | --- |
| `note.list` | query | — | `Note[]`, newest first | `NoteService.list` | `Note` |
| `note.byId` | query | `{ id }` | `Note`, `NOT_FOUND` if missing | `NoteService.byId` | `Note` |
| `note.create` | mutation | `{ title, content? }` | `Note` | `NoteService.create` | `Note` |
| `note.update` | mutation | `{ id, title?, content? }` | `Note` | `NoteService.update` | `Note` |
| `note.remove` | mutation | `{ id }` | `{ id }` | `NoteService.remove` | `Note` |

`Note` = `{ id: string; title: string; content: string; createdAt: Date; updatedAt: Date }`.
Dates arrive as real `Date` objects (superjson).

Used by the page: `note.list` (prefetched + client query), `note.create`,
`note.update`, `note.remove`. **`note.byId` exists but this page does not call
it** — the panel already has each row's data.

`GET /health` (`apps/api/src/app.controller.ts`) is the only REST endpoint; it
reports database reachability and is not called by this page.

## Behaviour

- The list query is invalidated after every mutation.
- Server-side prefetch + hydration, so there is no loading flash on first paint.
- Loading, error, and empty states are all handled.
- Title is required and trimmed; a partial update leaves `content` intact.
- A missing id yields `NOT_FOUND`.
- `note.list` returns every row — there is no pagination, search, or sorting
  input. Delete fires immediately, with no confirmation step.
- Every procedure is `publicProcedure`; `Note` has no user column.

## Reusable pieces

- `NotesPanel` — the pattern for **one form serving create and edit**.
  Extend it with props; do not fork a second form.
- `NoteService` — the pattern for a **decorator-free service** imported by the
  tRPC router. Copy `src/modules/note/` for a new feature.
- `note.schema.ts` — build update schemas from undefaulted fields.
  `createNoteInput.partial()` would keep `content`'s `.default("")` and blank the
  column on a title-only update.
- `pingDatabase` (`src/db/prisma.ts`) — reuse for any readiness probe.

## Linked routes

None — this is the only route.
