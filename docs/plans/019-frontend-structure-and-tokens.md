# 019 — Frontend structure and design tokens

**Status:** implemented
**Scope:** frontend

## Goal

Nothing changes for a user. `apps/dashboard` and `@reclit/ui` render the same
pixels, but the design lives in one TypeScript file, no component repeats
another, dead code is gone, and the frontend docs describe the code as it is
— each fact in one place.

## Backend (Agent 1)

None. No procedure, table or contract changes.

## Frontend (Agent 2)

- **Tokens:** new `packages/ui/src/tokens.ts` holds colours (light + dark),
  radius, the type scale, every named length (control heights and paddings,
  field paddings, checkbox/avatar/progress/spinner sizes, menu width, header,
  sidebar, panel, sheet header), the overlay alpha and motion. The Tailwind
  preset derives `theme.extend` and emits the `:root`/`.dark` CSS variables
  from it; `cn()` learns the names from it; the canvas sheet reads its
  fallback palette and header height from it. `globals.css` keeps base,
  scrollbar and utility CSS only.
- **Primitives:** every `@reclit/ui` component uses the named steps
  (`h-control`, `px-field-x`, `size-icon`, `bg-overlay/overlay` …). New
  internal `styles/field.ts` (shared Input/Textarea/SelectTrigger base) and
  `styles/menu.ts` (shared Select/DropdownMenu surface, label, separator);
  `focusOutline` joins `focus-ring.ts`.
- **Dashboard extractions:** `components/common/{error-fallback,page-shell,
  form-field}.tsx`, `components/ai-spreadsheet/ai-spreadsheet-header-action.tsx`,
  `hooks/{use-file-picker,use-latest-ref,use-reseed}.ts`, `i18n/metadata.ts`,
  `trpc/logger-link.ts`. Deleted: `ai-spreadsheet-export-button.tsx`,
  `ai-spreadsheet-cell-clear-button.tsx` (pure forwarders once the shared
  header action exists), `sample-payload.ts` (no importers), `jsonKeyCount`,
  the unused `SheetCanvasApi` export, two malformed `viewport.themeColor`
  entries.
- **Routes / states:** unchanged.

## Integration (Agent 3)

None. No query or mutation changes; the API URL and logger-link config are
deduplicated without changing values.

## Decisions

- CSS variables are emitted by a Tailwind plugin from `tokens.ts`, not kept in
  `globals.css` — one source, and TypeScript forces `dark` to cover `light`.
- Named lengths go on `theme.extend.spacing` only: it is the single key both
  Tailwind and tailwind-merge derive `h-`/`w-`/`p-`/`gap-`/`min-*` from.
- `h-sheet-header` is `36px`, not `2.25rem`: the canvas geometry is in px and
  the two must agree even under a non-16px root font size.
- The spinner stroke stays `border-2`/`border-4`: a named `border-*` step is
  read by tailwind-merge as a colour and would drop `border-muted`.
- Export and cell-clear header buttons are rendered directly from the grid via
  the shared header action rather than kept as one-line forwarders.
- A `QueryState` guard and a shared centred-wrapper div were rejected as
  wrapper-of-a-wrapper.
- `forcedTheme="light"` stays; dark tokens remain defined but unused.
- The empty `themeColor` entries are removed rather than given a colour, which
  would add behaviour.

## Risks / open questions

- tailwind-merge must know every new size name before a consumer uses one, or
  `cn("h-control", "h-auto")` keeps both. Settled by `cn.ts` deriving from
  `tokens.ts` in the same change, and by the computed-style diff below.
- `FormField` uses `flex flex-col gap-2`; three former `grid gap-2` wrappers
  change `display` but not layout.
- Verification: before/after computed-style snapshots of every control on
  `/`, `/settings`, `/populate`, `/ai-spreadsheet` (panel, account menu, new
  workspace dialog) and `/form/[id]`, plus a sorted diff of the generated
  Tailwind CSS.

---

## Outcome

- **Shipped:**
  - `packages/ui/src/tokens.ts` — colours (light/dark), radius, type scale,
    every named length, overlay alpha, motion, `SHEET_HEADER_PX`. The preset
    (`packages/ui/tailwind.config.ts`) derives `theme.extend` and emits the
    `:root`/`.dark` variables through a plugin; `globals.css` holds base,
    scrollbar and utility CSS only; `cn.ts` teaches tailwind-merge from the
    same object; `@reclit/ui/tokens` is exported.
  - Primitives on the named steps; `styles/field.ts` (Input / Textarea /
    SelectTrigger base), `styles/menu.ts` (Select / DropdownMenu surface,
    label, separator), `focusOutline` in `focus-ring.ts`; `dropdown-menu.tsx`
    shares `itemBase` / `indicatorSlot`.
  - Dashboard: `components/common/{error-fallback,page-shell,form-field}.tsx`,
    `components/ai-spreadsheet/ai-spreadsheet-header-action.tsx`,
    `hooks/{use-file-picker,use-latest-ref,use-reseed}.ts`,
    `i18n/metadata.ts`, `trpc/logger-link.ts`; chrome widths and the sheet
    header on tokens; `geometry.ts` and `theme-colors.ts` read the tokens.
  - Deleted: `ai-spreadsheet-export-button.tsx`,
    `ai-spreadsheet-cell-clear-button.tsx`, `sample-payload.ts`,
    `jsonKeyCount`, the `SheetCanvasApi` export, the empty `themeColor`
    entries.
  - Docs: `docs/rules/FRONTEND.md` rewritten (tree, page checklist, chrome,
    HeaderActions, useWorkspace, `@reclit/ui` inventory, Design tokens);
    `frontend-feature` skill and `ui-agent` shrunk to pointers; `AGENTS.md`,
    `README.md`, `docs/routes/{index,root,settings,ai-spreadsheet}.md`,
    `docs/rules/TESTING.md` corrected.
- **Verified:** lint, typecheck and the 124 dashboard tests pass; the sorted
  diff of the generated Tailwind CSS loses only the replaced default-scale
  classes; computed-style snapshots of `/`, `/settings`, `/populate` and
  `/form/[id]` are identical before and after, the sheet, account menu and
  new-workspace dialog identical within the baseline's sub-pixel scaling,
  except the `FormField` wrapper's `display: grid → flex`.
- **Deviated:** `packages/ui/package.json` `sideEffects` is now
  `["./src/globals.css"]` rather than `false` (the CSS entry is a side-effect
  import; `false` was wrong). The two `any` in `trpc/server.tsx` stay, with a
  one-line reason — they are tRPC's own template shape. `FRONTEND.md` is 335
  lines, not ≤300: the inventory and checklist earned the room.
- **Not done (behaviour gaps, deliberately out of scope):** no user feedback
  when a cell/column save fails (`use-sheet-sync.ts` snaps back silently;
  `syncColumnCreate`/`syncColumnUpdate` have no `onError`); no `error.tsx` or
  `loading.tsx` inside the `(app)`/`(public)` groups; only `X-Frame-Options`
  is set in `next.config.ts`; `API_BASE_URL` falls back to `localhost:4001`
  when the env is missing instead of failing fast; `console.error` in
  `use-sheet-runs.ts`; the billing Upgrade/Buy buttons and "Log out" carry no
  handlers; `not-found.tsx` redirects every 404 to `/`. Each is a behaviour
  change and gets its own plan.
- **Docs updated:** `docs/rules/FRONTEND.md`, `docs/rules/TESTING.md`,
  `docs/routes/{index,root,settings,ai-spreadsheet}.md`, `AGENTS.md`,
  `README.md`, `.claude/skills/frontend-feature/SKILL.md`,
  `.claude/agents/ui-agent.md`.
