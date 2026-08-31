# 004 — AI Spreadsheet

**Status:** implemented
**Scope:** frontend

## Goal

A third tab, **AI Spreadsheet**, showing a spreadsheet drawn on `<canvas>`: a
pinned header, endless vertical scroll over a 5,000,000-row sheet, uniform
cells, unlimited typed columns the user can add from a side panel, cell editing
painted on the canvas rather than in a DOM input, and JSON-valued cells shown as
a capsule that opens an editable key/value table.

## Backend (Agent 1)

None. The page calls no API. The payload type mirrors the shape the sheet
endpoint is expected to return so wiring it later is a one-line change in the
page.

## Frontend (Agent 2)

- **Route:** `/ai-spreadsheet`, static, full-bleed (`h-full`).
  Nav entry added to `navSections[0]` in `config/nav.ts`; `app-sidebar.tsx`
  untouched.
- **Components:** all new, under `components/ai-spreadsheet/` (grid, header,
  body, input proxy, side panel, column form, JSON editor) plus five hooks and
  a sample payload. Pure logic — types, geometry, palette, formatting, text
  metrics and four painters — lives in `lib/ai-spreadsheet/` and imports no
  React. `hooks/use-canvas-surface.ts` is generic and feature-agnostic.
  `packages/ui` gained no components; it gained a `.scrollbar-none` utility and
  a `duration-smooth`/`ease-smooth` motion pair, both shared.
- **States:** there is no fetching, so no loading or error state. Empty is the
  normal case — every row past the payload is a blank editable cell, and a
  missing cell in a row that *was* sent takes the same path.

## Integration (Agent 3)

None. Every edit is in memory.

## Decisions

- **Two canvases, not one.** Header and body are separate elements in separate
  grid rows; that is what pins the header, with no scroll listener involved.
- **The scroll spacer is capped at 8,000,000px and offsets are mapped through a
  ratio.** 5M rows is 160,000,000px, roughly 5× Chrome's element limit and 9×
  Firefox's. A 1:1 spacer would silently strand most of the sheet. Rejected:
  wheel-only virtual scrolling with no native scrollbar at all, which loses
  touch and keyboard scrolling.
- **The wheel is handled directly, `{ passive: false }`.** At a ratio of ~20
  one notch would otherwise jump 60 rows. React's `onWheel` is passive at the
  root and cannot `preventDefault`, so the listener is attached by hand.
- **Scrollbars on the sheet are hidden.** At 8,000,000px of range the thumb is
  a sliver that tells the reader nothing. Requested by the user; it also keeps
  the scroller's client box a fixed width.
- **The body canvas lives *outside* the scroll container.** Inside, it counts
  toward scrollable overflow, so sizing it to the client box raises a
  scrollbar, which shrinks the client box, which resizes the canvas — an
  oscillation that settles with both scrollbars stuck on. The scroller sits on
  top, transparent, owning scrolling and pointer events.
- **The header canvas is out of flow and clipped.** Its width is written
  imperatively and only corrected when the `ResizeObserver` fires, so in flow it
  is briefly wider than its container after the sidebar collapses — which
  widened the page and carried the side panel past the right edge.
- **The side panel overlays the sheet, it does not share a grid track.** It
  sits in the row below the header, so it cannot cover the column names, but
  opening it no longer resizes or reflows the grid. Changed from the original
  design on the user's request.
- **The panel stays mounted while closed**, inert and translated off, so it can
  animate out as smoothly as it animates in. An unmounted element cannot.
- **The render loop reads refs only.** A cell edit mutates a `Map` and
  schedules a frame; React never re-renders, because a re-render can remount
  the canvas and a remounted canvas is blank. State is limited to the panel and
  a columns version.
- **Full visible repaint, no dirty regions.** ~200 cells a frame with memoised
  text measurement; the bookkeeping would cost more than the frames it saves.
- **Cells are a sparse `Map` keyed `row:columnId`.** A 5M-row array is not
  allocatable, absence already means "blank", and keying by column id rather
  than index means a future reorder does not shift every value.
- **The type selector is a native `<select>`, not a shadcn/Radix one.** Radix
  Select portals and traps focus, which fights the grid's hidden focus proxy.
  Native also avoids adding a Radix dependency and stripping its exit
  animations.
- **No blur-refocus on the input proxy.** The usual trick for keeping a canvas
  grid "hot" traps focus against every other control on the page; focus returns
  on the next pointerdown instead.
- **Pagination is parsed and ignored.** An unfetched row renders blank, which
  is already correct; adding real paging means merging pages into `cells`,
  tracking loaded ranges, and one skeleton branch in `paint-cell.ts`.

## Risks / open questions

- Per-cell reading by assistive technology is not possible — the cells are
  pixels. The container carries grid semantics and the `+` has a real button,
  but that is the ceiling without a parallel DOM mirror.
- Hiding the scrollbar leaves the wheel and keyboard as the only way to reach
  distant rows. A "go to row" affordance would fix that if it bites.
- The blank tail grows but never shrinks, so a long session that scrolls far
  past `rowCount` keeps the enlarged extent. Harmless; worth remembering.

---

## Outcome

- **Shipped:** the route, nav entry and i18n keys; 8 components and 5 hooks
  under `apps/dashboard/src/components/ai-spreadsheet/`; 9 pure modules under
  `apps/dashboard/src/lib/ai-spreadsheet/`; `hooks/use-canvas-surface.ts`; a
  `.scrollbar-none` utility in `packages/ui/src/globals.css` and the
  `duration-smooth`/`ease-smooth` pair in `packages/ui/tailwind.config.ts`,
  which `app-sidebar.tsx` now uses for its collapse.
- **Deviated:** the side panel overlays the body instead of occupying its own
  grid column, and the sheet's scrollbars are hidden — both on the user's
  request after seeing it run. `use-sheet-canvas.ts` was split out of the grid
  component to stay under the size caps, and `use-sheet-scroll.ts` out of
  `use-sheet-viewport.ts` for the same reason.
- **Not done:** pagination, multi-cell selection and TSV paste, column reorder
  or delete, row insert or delete, undo/redo, formulas, sorting, filtering, and
  persistence — including sending edits back with the `rowIds`/`cellIds` the
  model already keeps for that purpose.
- **Docs updated:** [docs/routes/ai-spreadsheet.md](../routes/ai-spreadsheet.md)
  and its row in [docs/routes/index.md](../routes/index.md). No feature doc —
  there is no backend feature.
