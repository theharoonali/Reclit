# Common Rules

Applies to both apps. See also [BACKEND.md](BACKEND.md) and [FRONTEND.md](FRONTEND.md).

## Types

1. **Zod schemas are the single source of truth.** Every feature declares its
   shapes in `apps/api/src/modules/<feature>/<feature>.schema.ts`.
2. Backend types come from `z.infer<typeof schema>`. Never hand-write an
   interface that mirrors a schema.
3. Frontend types come from `RouterInputs` / `RouterOutputs`
   (`@repo/api/trpc/routers/_app`). Never re-declare a shape the API already
   describes.
   ```ts
   type Note = RouterOutputs["note"]["list"][number];
   ```
4. **Prisma model types never cross the tRPC boundary.** Services select explicit
   fields and declare a schema-inferred return type. If `@prisma/client` types
   reach the dashboard, that rule was broken.
5. The dashboard imports API code **type-only**. Never import API runtime code.

## Plans

- A plan that is written but **not yet executed** goes in
  `docs/exec-plans/active/` — one file per plan, numbered (`001-…`).
- Once executed, **move** it to `docs/exec-plans/completed/` and tick its
  checklist. Never delete a plan.
- Deliberate gaps go in [../exec-plans/tech-debt-tracker.md](../exec-plans/tech-debt-tracker.md).

## Docs

- Every route has a doc in [`docs/routes/`](../routes/index.md), created from
  [`_template.md`](../routes/_template.md).
- **Changing a route's files or APIs means updating its route doc in the same
  change.** The doc is the contract; stale docs are worse than none.
- Read the route doc before opening code. Open code only when the doc is
  insufficient — then fix the doc.

## Naming

- Files and folders: `kebab-case`. Types and classes: `PascalCase`.
  Variables and functions: `camelCase`.
- A feature uses one name everywhere: `note` → `note.service.ts`, `noteRouter`,
  `NoteService`, `components/notes-panel.tsx`.
