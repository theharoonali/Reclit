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

## Implemented

- [x] List, create, update, delete, with the list query invalidated after each mutation
- [x] Server-side prefetch + hydration (no loading flash on first paint)
- [x] Loading, error, and empty states
- [x] Title required and trimmed; partial update keeps `content` intact
- [x] `NOT_FOUND` on a missing id
- [x] `GET /health` reports database reachability
- [x] API tests in `apps/api/src/__tests__/` (skip DB-backed checks when the DB is unreachable)

## Not implemented

- [ ] **Pagination / search / sorting** — `note.list` returns every row.
      Add input to `note.list` + `NoteService.list`, then a control in `notes-panel.tsx`.
- [ ] **Delete confirmation** — Delete fires immediately.
- [ ] **Optimistic updates / toasts** — mutations wait for the refetch.
- [ ] **Ownership / auth** — every procedure is `publicProcedure`; `Note` has no
      user column. Needs a `protectedProcedure` in `apps/api/src/trpc/init.ts` first.
- [ ] **Detail route** (`/notes/[id]`) — `note.byId` is already there for it.
- [ ] **Frontend tests** — the dashboard has no test setup yet.

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
