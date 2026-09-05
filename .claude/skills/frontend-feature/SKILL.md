---
name: frontend-feature
description: Build dashboard UI — pages, feature components, shared shadcn primitives, app chrome (sidebar/header), and design tokens. Use when the user asks to add a screen, component, layout, navigation entry, or styling change in apps/dashboard.
---

# Build frontend UI

The rules are [docs/rules/FRONTEND.md](../../../docs/rules/FRONTEND.md) — read
it, then this checklist. Shared rules: [COMMON.md](../../../docs/rules/COMMON.md).

**Need an API shape?** Read only the contract header of
`apps/api/src/__tests__/<feature>.api.test.ts`. Never read backend source.

## 1. Reuse check — before writing anything

```bash
ls packages/ui/src/components apps/dashboard/src/components/common
grep -rn "<what you are about to build>" apps/dashboard/src packages/ui/src
```

Exists → import it · nearly exists → add a prop or `cva` variant · used by two
features → `components/common/` · generic → `packages/ui` + `exports` entry.
**Never fork a component.** The `@reclit/ui` inventory and the `common/` list
are in FRONTEND.md ("Reuse before you build", "`@reclit/ui` inventory").

## 2. Where it goes and how it is built

- A new page: follow "Adding a page" in FRONTEND.md — nav entry, thin
  `page.tsx` with `pageMetadata` + `PageShell`, components in
  `components/<feature>/`, strings in `en.json`, route doc.
- A component takes props and callbacks (`items`, `isPending`, `error`,
  `onCreate`…) and renders loading, error and empty. Under ~150 lines; split
  the container (`<feature>-panel.tsx`) from the views beyond that. One form
  serves create and edit via an optional record.
- Controls are `@reclit/ui` primitives; a label over a control is
  `FormField`; a page-level control is `<HeaderActions>`.
- Every length, colour and text size is a token or a scale step — a new one is
  one key in `packages/ui/src/tokens.ts` ("Design tokens" in FRONTEND.md).
- Worked examples: `components/settings/profile-settings.tsx` (query + states),
  `components/workspace/create-workspace-dialog.tsx` (mutation + invalidate),
  `components/ai-spreadsheet/ai-spreadsheet-column-form.tsx` (create/edit form).

## 3. Data

Building the UI before its API exists? Render from a local fixture typed to
the contract, expose `on*` callbacks, and let the integration step wire it —
[WORKFLOW.md](../../../docs/rules/WORKFLOW.md). Wiring itself is the "Data"
section of FRONTEND.md.

## 4. Docs + verify

Update the route doc in [docs/routes/](../../../docs/routes/index.md) in the
same change, then:

```bash
bunx turbo lint typecheck --filter=@reclit/dashboard
bunx turbo build --filter=@reclit/dashboard
```

Then look at it: `bun run dev:dashboard` (http://localhost:4000), at desktop
and narrow widths.
