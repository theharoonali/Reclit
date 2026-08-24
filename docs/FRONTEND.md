# Frontend

How `apps/dashboard` is put together. The rules you must follow when
adding to it are in [rules/FRONTEND.md](rules/FRONTEND.md); per-page file and API
maps are in [routes/](routes/index.md).

## Structure

```
apps/dashboard/src/
├── app/                    # App Router: layout, providers, error/not-found
│   └── page.tsx            # `/` → docs/routes/root.md
├── components/
│   └── notes-panel.tsx     # the notes CRUD — the one feature component
├── styles/globals.css      # app-level CSS (minimal; theme vars live in @reclit/ui)
└── trpc/                   # client.tsx (browser), server.tsx (RSC), query-client.ts
```

## Conventions

- Fonts: Geist + Geist Mono loaded in `app/layout.tsx`, exposed as `--font-sans` /
  `--font-mono`; the `@reclit/ui` Tailwind preset maps `font-sans`/`font-mono` to them.
- Theming: `next-themes` with `attribute="class"`; color tokens are CSS variables
  defined in `@reclit/ui`'s `globals.css`, referenced via the Tailwind preset
  (`bg-background`, `text-muted-foreground`, …).
- UI components come from `@reclit/ui` subpath imports — currently just
  `@reclit/ui/button`. Add new shadcn-style components to
  `packages/ui/src/components/` and register them in its `exports` map. They are
  unanimated by design. Everything else is plain markup styled with the
  Tailwind theme tokens.
- Data fetching: tRPC + TanStack Query. Client components use
  `useTRPC()` + `useQuery(trpc.x.y.queryOptions(input))`. Server components can use
  `trpc` + `prefetch`/`HydrateClient` from `@/trpc/server`.
- The dashboard never imports API runtime code — only the `AppRouter` type.

- Pages that read live database data set `export const dynamic = "force-dynamic"`
  so Next does not prerender them at build time.

## Design system

No formal design system yet — tokens are the CSS variables in
`packages/ui/src/globals.css`, surfaced through the Tailwind preset. Component
guidelines live in [rules/FRONTEND.md](rules/FRONTEND.md).
