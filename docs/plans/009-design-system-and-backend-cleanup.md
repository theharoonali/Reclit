# 009 — Design system standardization + backend cleanup

**Status:** implemented
**Scope:** frontend (tokens + primitives) · backend (dedupe) · rules

## Context

Two problems, one round.

**Frontend.** The design system has drifted in ways that only show up when you
look at every control at once:

- There is no single "black". Light text is `#121212`, the dark background is
  `#0D0D0D`, and neither is the `#1B1D20` the app is supposed to use.
- `Button` has **no focus ring at all** (`packages/ui/src/components/button.tsx:7`
  sets `focus-visible:outline-none` and nothing else), and
  `apps/dashboard/src/styles/globals.css:6-8` globally kills `*:focus { outline: none }`.
  Every button in the app is invisible to keyboard users.
- The focus recipe that *does* exist (`focus-visible:ring-2 focus-visible:ring-ring/40`)
  is copy-pasted in three places — `input.tsx:14`, `select.tsx:25`,
  `app-sidebar.tsx:185` — so "modern focus border" has no single owner. Third
  occurrence is a bug by COMMON.md §4.
- Radius is only half token-driven. `borderRadius` overrides `sm/md/lg` only, so
  `rounded-xl` (`dashboard-empty.tsx:15`) and `rounded-r` (`app-sidebar.tsx:153`)
  silently bypass `--radius`.
- The selector is a native `<select>`, not shadcn. There is no `Label` primitive,
  so `ai-spreadsheet-column-form.tsx:46,59` hand-rolls `text-label text-card-foreground`
  on a raw `<label>` twice.
- `button.tsx:15` has a duplicated `border border` class — the outline variant only
  gets its colour by accident, from the global `* { @apply border-border }`.

**Backend.** Prisma error codes are *already* centralized correctly
(`common/prisma-errors.ts` is the only place `P2002`/`P2025` appear) — but there
is real duplication and dead code elsewhere: a byte-identical `isPlainObject` in
two files, two identical multipart controller preambles, four dead exports, and
domain errors declared inline in a service against the repo's own rule.

Outcome: one black, one radius, one focus recipe, a real shadcn `Select` and
`Label`, no dead or duplicated backend code, and rules that say so.

## Decisions

- **`#1B1D20` = `hsl(216 8.5% 11.6%)`.** It becomes the light-mode text colour
  *and* the dark-mode app background. Orange (`--primary`, `--ring`) is untouched.
- **`--radius: 0.625rem`** (shadcn v4 default), up from `0.5rem`.
- **Focus = shadcn v4 ring**: `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]`,
  defined once and imported.
- **`Select` becomes the real Radix shadcn Select.** `@radix-ui/react-select` is
  added to `packages/ui`. The current `select.tsx` doc comment claims Radix would
  fight the canvas focus proxy — that is **stale**: `ai-spreadsheet-input-proxy.tsx:21-26`
  says the proxy deliberately does *not* re-focus on blur, and the only
  `onPointerDown` handlers are on the grid canvas itself
  (`ai-spreadsheet-grid.tsx:190,202`). A Select in the side panel is safe.
- **`Label` ships without Radix.** shadcn's Label wraps `@radix-ui/react-label`
  for one `onMouseDown` guard; a plain `<label>` + `cva` gives the same result
  with no new dependency.
- **Backend is refactor-only.** No status code, error code, route or payload
  changes. `spreadsheet.api.test.ts` and `file.api.test.ts` pass unmodified.
- **Output zod schemas stay.** They are runtime-dead (~60 lines, never `.parse()`d)
  but COMMON.md §3.1 makes them the declared type source. Deleting them to save
  lines would break a standing rule; not worth it.
- **`rxjs` stays** in `apps/api/package.json`. Unimported, but it is a peer
  dependency of `@nestjs/core`.

## Frontend

### 1. Tokens — `packages/ui/src/globals.css`

Rewrite the `:root` / `.dark` blocks:

- **Normalize every triple to space-separated.** Eleven tokens are currently
  comma-separated (`--background: 0, 0%, 100%`), which makes `hsl(var(--x) / 0.5)`
  silently invalid — the trap documented at `globals.css:66-72` and
  `FRONTEND.md:174-179`. After this, `/alpha` works on every token and both
  warnings get deleted.
- Add `--black: 216 8.5% 11.6%` as the named source, then:
  - **Light:** `--foreground`, `--card-foreground`, `--popover-foreground`,
    `--secondary-foreground`, `--accent-foreground` → `var(--black)`.
  - **Dark:** `--background` → `var(--black)`; `--card`/`--popover` one step up
    (`216 8.5% 15%`); `--secondary`/`--muted`/`--accent` (`216 8% 18%`).
- Fix two dark-mode defects while in here: `--border` currently equals
  `--muted`/`--accent`/`--input` (`0 0% 11%`), so borders vanish against hovered
  surfaces — set `216 7% 22%`; and `--muted-foreground` is identical in both modes
  (`0 0% 38%`), unreadable on `#1B1D20` — set `216 6% 64%`.
- **Give `--input` a job.** It is defined and never referenced today. It becomes
  the form-control border (shadcn semantics): light `45 5% 85%`, dark `216 7% 26%`.
  `Input`/`Select` switch from `border-border` to `border-input`.
- `--radius: 0.625rem`.

### 2. Radius steps — `packages/ui/tailwind.config.ts`

Extend `borderRadius` with `xl: calc(var(--radius) + 4px)` and
`2xl: calc(var(--radius) + 8px)` so `rounded-xl` derives from the token instead
of Tailwind's stock `0.75rem`.

### 3. One focus recipe — new `packages/ui/src/styles/focus-ring.ts`

```ts
export const focusRing =
  "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] " +
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20";
```

Exported as `"./focus-ring"` in `packages/ui/package.json`. Consumed by
`button.tsx`, `input.tsx`, `select.tsx`, `label.tsx`, and `app-sidebar.tsx:185`
(which drops its copy). This is the "third occurrence → extract" rung of
COMMON.md §4.

Delete `*:focus { outline: none }` from `apps/dashboard/src/styles/globals.css` —
the primitives now own `outline-none` themselves, and the global rule is what
made the missing button ring invisible rather than merely ugly.

### 4. Primitives — `packages/ui/src/components/`

| File | Change |
| --- | --- |
| `button.tsx` | Add `focusRing` to the `cva` base. Fix `border border` → `border border-input` on `outline`. Adopt the shadcn v4 base additions: `gap-2 whitespace-nowrap shrink-0 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:pointer-events-none`. Keep the existing 6 variants / 4 sizes and the `text-label`/`text-caption` scale classes (repo type scale, not raw steps). |
| `input.tsx` | `border-border` → `border-input`; replace the inline ring string with `focusRing`. |
| `select.tsx` | **Rewrite** as the shadcn Radix `Select` — `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`. Two required edits per FRONTEND.md:138-142 — import `cn` from `../utils`, and **strip every enter/exit animation class** (`data-[state=closed]:animate-out`, `fade-out-0`, `zoom-*`, `slide-in-from-*`). Trigger uses `focusRing` and matches `Input`'s h-9 / `border-input` / `rounded-md`. |
| `label.tsx` | **New.** `cva` over a plain `<label>`: `text-label text-card-foreground` + `peer-disabled:opacity-50`. No Radix. |

`packages/ui/package.json`: add `@radix-ui/react-select` to `dependencies` (let
the installer write the version — COMMON.md §2), and `"./label"` +
`"./focus-ring"` to `exports`.

### 5. Dashboard sweep

- **`ai-spreadsheet-column-form.tsx`** — the reference form. Raw `<label>` ×2 →
  `<Label>`. Native `<select>` + `<option>` → `SelectTrigger`/`SelectValue`/
  `SelectContent`/`SelectItem`. The `onChange` handler becomes Radix's
  `onValueChange`.
- **Button props audit** — every call site gets a deliberate `variant`/`size`
  rather than defaulting. Concretely: `ai-spreadsheet-json-editor.tsx:127` drops
  `<Plus className="mr-2 h-4 w-4" />` → `<Plus />` (the new base supplies `gap-2`
  and sizes the icon); `app-sidebar.tsx` nav links compose `buttonVariants({ variant: "ghost" })`
  instead of hand-rolled `rounded-md` + a duplicated ring; `app-sidebar.tsx:153`
  `rounded-r` and `dashboard-empty.tsx:15` `rounded-xl` now resolve from `--radius`.
  Other sites reviewed and left alone if already correct
  (`side-panel.tsx:53 size="icon"`, `import-button.tsx:57 size="sm"`).
- **`app-sidebar.tsx:73,110,147,158`** — drop `font-medium`/`font-semibold` paired
  with a scale class (FRONTEND.md:209-210); the scale already carries weight.
- **`app/error.tsx:13`** — `min-h-screen` violates the shell scroll contract
  (FRONTEND.md:76-81); it renders inside `<main>`. Use `h-full`.
  `global-error.tsx` keeps it — it replaces the root layout.
- **`lib/ai-spreadsheet/theme-colors.ts`** — `normalizeHsl` (:15-27) exists only to
  paper over the comma/space split; with tokens uniform it collapses to a
  pass-through and `withAlpha` simplifies. Refresh `FALLBACK_PALETTE` (:64-79) to
  the new light values so the canvas first paint matches.
- **`lib/ai-spreadsheet/types.ts:19-28`** — `ColumnType` is missing `"formula"`,
  which the API's `COLUMN_TYPES_WIRE` has. A `formula` column from the API is
  currently unrepresentable. Add it to the union, and keep it **out** of
  `COLUMN_TYPES` in `cell-format.ts:9-19` (the pickable list) so it can be
  displayed but not created.

## Backend

Refactor only — no behavior change.

| Change | Files |
| --- | --- |
| Delete the byte-identical duplicate `isPlainObject`; import the existing one instead (`infer.ts` already imports from the schema) | `spreadsheet-import.infer.ts:81-83` → export from `spreadsheet.schema.ts:43-45` |
| Extract the twice-repeated multipart preamble — `@UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))` plus the identical `if (!file) throw new BadRequestException(...)` — into an `@UploadFile()` composite decorator + `requireFile()` helper. New file, since `common/multipart.ts` is deliberately framework-free; `common/domain-error.filter.ts` is the precedent for Nest code under `common/` | new `apps/api/src/common/upload.ts`; `file.controller.ts:20-28`, `spreadsheet.controller.ts:67-75` |
| Move the two inline domain errors into a `file.errors.ts` (BACKEND.md:20 requires it at >1) | `file/file.service.ts:10-26` → new `file/file.errors.ts` |
| Delete dead exports: `IdInput`, `PaginationInput` (zero references) | `common/schema.ts:14-15` |
| Delete `parseShortRowId` / `parseShortColumnId` — dead in the API, and a verbatim duplicate of the live dashboard copy in `lib/ai-spreadsheet/short-ids.ts` | `spreadsheet.ids.ts:20-28` |
| Align the drifted `EMAIL_RE` so the API and dashboard copies are textually identical (`[^\s@]` vs `[^@\s]`) — they cannot be shared, since `apps/api` exports only `./trpc/routers/_app` | `spreadsheet.schema.ts:41`, `lib/ai-spreadsheet/cell-format.ts:23` |

**Deliberately not changed:** `KIND_TO_TRPC` (`trpc/init.ts:20-27`) and
`KIND_TO_STATUS` (`common/domain-error.filter.ts:12-18`) look like duplication but
cannot be merged — the filter imports `@nestjs/common`, and AGENTS.md invariant 2
forbids that anywhere in the `src/trpc/**` graph. Both are exhaustive
`Record<DomainErrorKind, …>`, so TypeScript catches a missed kind. This gets
written down in BACKEND.md rather than "fixed".

## Rules

- **`docs/rules/FRONTEND.md`**
  - Styling table: add a **focus** row (`packages/ui/src/styles/focus-ring.ts`, the
    only focus recipe — never write `focus-visible:ring-*` in a component) and a
    **black** row (`--black`, never inline `#1B1D20`).
  - Radius: `--radius` is the only source; `rounded-sm/md/lg/xl/2xl` derive from it;
    `rounded-full` and `rounded-none` are the only literal radii allowed.
  - Delete the comma/space alpha-modifier caveat (:174-179) — tokens are uniform now.
  - shadcn section: `Select` is Radix-backed; add `Label` to the "never hand-roll a
    form control" list at :145-151 (a raw `<label>` with utility classes is the
    same bug); state that a `Button` always carries an explicit `variant`, and that
    icons inside a `Button` need no spacing or size classes.
- **`docs/rules/BACKEND.md`** — add three rows to the *No repetition* table:
  Prisma error codes → `common/prisma-errors.ts`; multipart upload plumbing →
  `common/upload.ts`; domain errors at >1 → `<feature>.errors.ts`, never inline in
  the service. Add a note under *Errors* explaining why the two kind-maps are
  deliberate twins.
- **`AGENTS.md`** — two stale lines: :115-116 claims `/health` is the only REST
  route (there are 17 more), and :30-34 lists `@reclit/ui` as `Button, Input,
  Spinner` (it is Button, Input, Select, Label, Calendar, Spinner).
- **`docs/routes/ai-spreadsheet.md`** — the column form's controls changed.

## Verification

1. `bunx turbo lint typecheck` — catches the `Select` API change at every call
   site and the removed backend exports.
2. `bunx turbo test` — `spreadsheet.api.test.ts` and `file.api.test.ts` must pass
   **unmodified**. If either needs an edit, the backend refactor stopped being
   behavior-preserving; revert that step.
3. `bun dev`, then in the browser preview at `http://localhost:4000/ai-spreadsheet`:
   - Open the column side panel. The type selector opens a shadcn dropdown, picks
     a value, and closes — and clicking back on the grid still puts focus on the
     canvas proxy (this is the risk the old doc comment named).
   - **Tab** through header → sidebar → panel form. Every button, input and the
     select trigger shows the same 3px ring. Nothing is invisible on focus.
   - Toggle dark mode. Background reads `#1B1D20`; borders are visible against
     hovered rows; muted text is legible.
   - Edit a cell, reload — the value survives (proves the tRPC round trip is intact).
4. `javascript_tool`: `getComputedStyle(document.documentElement).getPropertyValue('--radius')`
   → `0.625rem`, and a button's computed `border-radius` matches an input's.
5. `bun run format`.

## Risks

- **Radix Select vs the canvas focus proxy.** Traced and believed safe (no global
  refocus). If a Select interaction does steal the grid's focus, the fallback is
  to keep the Radix Select everywhere and leave the grid's own controls native —
  not to revert the primitive.
- **Token normalization is a wide, silent change.** Any `hsl(var(--x), 0.5)` style
  usage written for the comma form breaks. Grep for `var(--` across both apps
  before and after; `theme-colors.ts` is the only known consumer.
- **`ColumnType` gaining `"formula"`** may surface `switch` statements that are no
  longer exhaustive. That is the point — typecheck will list them.

---

## Outcome

**Shipped.**

*Tokens.* `packages/ui/src/globals.css` — every triple normalised to
space-separated, `--radius: 0.625rem`, and `#1B1D20` (`216 8.5% 11.6%`) as the
light-mode text colour and the dark-mode page surface. `--input` was given a job
(the form-control border, light `45 5% 85%` / dark `216 7% 26%`), dark `--border`
lifted off `--muted` so it is visible again, and dark `--muted-foreground` tuned
for the new surface. `tailwind.config.ts` gained `rounded-xl`/`rounded-2xl` steps
and a `text-eyebrow` scale entry.

*Primitives.* New `packages/ui/src/styles/focus-ring.ts` (`focusRing`), composed
by `button.tsx`, `input.tsx`, `select.tsx` and the sidebar nav link — the recipe
existed in three copies and was missing from `Button`. New
`packages/ui/src/components/label.tsx`. `select.tsx` rewritten as shadcn's Radix
`Select` on `@radix-ui/react-select@2.3.7`, animations stripped. `button.tsx`
fixed (`border border` → `border border-input`) and given the shadcn v4 icon
base.

*Dashboard.* `ai-spreadsheet-column-form.tsx` now uses `Label` and the Radix
`Select`; icon-in-button size classes dropped in four components; the global
`*:focus { outline: none }` deleted; `error.tsx` off `min-h-screen`;
`theme-colors.ts` simplified now that tokens are uniform.

*Backend.* `common/upload.ts` (`@UploadFile()` + `requireFile()`) replaces the
duplicated multipart preamble in both controllers; `file.errors.ts` extracted
from the service; the duplicate `isPlainObject` and four dead exports deleted.
No route, status, error code or payload changed.

**Deviated.**

- **A pre-existing bug surfaced during verification and was fixed:**
  tailwind-merge did not know the custom `fontSize` scale, so `cn()` classified
  `text-label` as a colour and dropped it whenever a text colour followed. Every
  default `Button` was rendering at the inherited 16px/400 instead of 14px/500.
  `packages/ui/src/utils/cn.ts` now extends tailwind-merge with the scale, and
  FRONTEND.md records that a new scale entry must be added in two places.
- `ColumnType` in the dashboard gained `"formula"` (it was missing, so a formula
  column the API returns was unrepresentable), but `formula` is excluded from
  `columnTypes` — the picker offers nine types, the sheet can render ten.
- One dashboard test changed: `use-sheet-model.test.ts` asserted that a
  `formula` column degrades to `string` — the drift bug itself. It now asserts
  the opposite: a `formula` column is kept, while staying out of `columnTypes`.
  The degrade path is still covered, by `cell-format.test.ts` ("timestamptz"),
  and `toColumnType("formula")` was added there.
- The `EMAIL_RE` copies in the API and the dashboard were aligned character for
  character rather than shared; `apps/api` exports only `./trpc/routers/_app`,
  so a REST-only helper cannot cross.
- `KIND_TO_TRPC` / `KIND_TO_STATUS` left as deliberate twins, now documented in
  BACKEND.md. Output zod schemas and `rxjs` left alone, as planned.

**Not done.**

- Interactive verification was partial: the Browser pane was not displayed, so
  real keyboard input and screenshots were unavailable, and the browser stops
  recalculating style for hidden pages — dark mode was confirmed from the
  emitted CSS and the `--*` values rather than from painted colours.
- `file.api.test.ts` is skipped without `SUPABASE_URL`/`SUPABASE_KEY`, so the
  `file.errors.ts` extraction is covered by typecheck and by the API booting
  with `POST /files` mapped, not by a running test.
- `FALLBACK_PALETTE` in `theme-colors.ts` is still light-only, so the canvas's
  first frame in dark mode flashes light. Pre-existing; out of scope.

**Verified.** `bunx turbo lint typecheck` clean; `bunx turbo test` green — api
49 pass / 0 fail with both contract tests **unmodified**, dashboard 62 pass /
0 fail; the API boots with all 18 REST
routes mapped. In the browser: `--radius` is `0.625rem` and button, input and
select trigger all compute to 8px radius / 36px height / the same border colour;
light body text is `rgb(27, 29, 32)` and the dark body surface is the same; all
three controls carry the identical focus recipe; the Select opens a listbox of
exactly the nine pickable types, and on close leaves no portal node behind and
restores `pointer-events` on `body`; a pointerdown on the canvas moves focus
from the panel's input back to the grid's proxy textarea — the risk this plan
flagged.

**Docs updated.** `docs/rules/FRONTEND.md` (radius, focus, black, the `cn()`
coupling, Button variants, `Label`), `docs/rules/BACKEND.md` (three new
no-repetition rows, the twin-map note), `AGENTS.md` (two stale lines),
`docs/routes/ai-spreadsheet.md`, `docs/features/file.md`,
`docs/features/spreadsheet.md`.
