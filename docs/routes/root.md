# `/`

**Purpose:** Notes CRUD. The reference vertical slice — Next.js → tRPC → NestJS
service → Prisma → Postgres. Copy this shape for new features.

**Rendering:** dynamic (`export const dynamic = "force-dynamic"`). It reads live
database rows, so it must not be prerendered at build time.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/page.tsx` | RSC | Page framing; server-prefetches `note.list` and wraps the panel in `HydrateClient` |
| `apps/dashboard/src/components/notes-panel.tsx` | client | The whole CRUD UI: **one** form serving create *and* edit (`editing` unset = create, set = edit), the notes list, per-row Edit/Delete |
| `apps/dashboard/src/app/layout.tsx` | RSC | Root layout: Geist fonts, `Providers` |
| `apps/dashboard/src/app/providers.tsx` | client | `TRPCReactProvider` + `next-themes` |

Shared pieces used: `@reclit/ui/button`. Everything else is plain markup styled
with Tailwind theme tokens. There is no app chrome yet — no sidebar, header, or
footer — and no `(app)` route group.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `note.list` | query | `page.tsx` (prefetch) + `notes-panel.tsx` | — |
| `note.create` | mutation | `notes-panel.tsx` | `note.list` |
| `note.update` | mutation | `notes-panel.tsx` | `note.list` |
| `note.remove` | mutation | `notes-panel.tsx` | `note.list` |

Payloads and responses: the contract header of
`apps/api/src/__tests__/note.api.test.ts`.
Backend detail: [docs/features/note.md](../features/note.md).

**`note.byId` exists but this page does not call it** — the panel already has
each row's data. `GET /health` (`apps/api/src/app.controller.ts`) is the only
REST endpoint and is not called here.

## Behaviour

- Server-side prefetch + hydration, so there is no loading flash on first paint.
- The list query is invalidated after every mutation.
- Loading, error, and empty states are all handled.
- Title is required and trimmed; a partial update leaves `content` intact.
- Delete fires immediately, with no confirmation step.
- Every procedure is public — the page has no auth or per-user filtering.

## Reusable pieces

- `NotesPanel` — the pattern for **one form serving create and edit**. Extend it
  with props; do not fork a second form.
- The panel is the extraction candidate when a second feature lands: it moves to
  `components/note/` and splits into panel + list + form
  ([../rules/FRONTEND.md](../rules/FRONTEND.md)).

## Linked routes

None — this is the only route.
