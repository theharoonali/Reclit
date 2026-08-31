# reclit

reclit — a Bun + Turborepo monorepo template with a Next.js frontend and a NestJS backend,
connected end-to-end with tRPC. It contains exactly one example of each pattern —
copy the pattern to build features.

## Stack

- **Runtime / package manager:** [Bun](https://bun.sh)
- **Monorepo:** [Turborepo](https://turborepo.dev) with Bun workspaces
- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind + a shadcn-style `Button`
- **Backend:** NestJS 11 (running directly on Bun) + tRPC 11
- **Database:** PostgreSQL via Prisma 7
- **Lint/format:** Biome

## Structure

| Path | Description |
| --- | --- |
| `apps/api` | NestJS API server (port 4001), tRPC at `/trpc`, Prisma schema in `prisma/` |
| `apps/dashboard` | Next.js web app (port 4000) |
| `packages/ui` | The one shared package: `Button` component + Tailwind preset |

## Getting started

```bash
bun install
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL
bun run --filter=@reclit/api db:migrate    # create the tables
bun dev
```

- API: http://localhost:4001 (`/health`, `/trpc/*`)
- Dashboard: http://localhost:4000 — `/` shell, `/ai-spreadsheet`, `/populate`

`DATABASE_URL` is the only variable you must set; everything else has a working
local-dev default (`.env.example` files document them). On Supabase, the direct
`db.<ref>.supabase.co` host resolves IPv6-only — if your network has no IPv6
route, use the **Session pooler** connection string instead.

## Docs

- [AGENTS.md](AGENTS.md) — map for AI coding agents (commands, conventions, invariants)
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces connect
- [docs/rules/](docs/rules/COMMON.md) — coding rules: common, backend, frontend, testing, workflow
- [docs/features/](docs/features/index.md) — one doc per backend feature: table, service, procedures
- [docs/routes/](docs/routes/index.md) — one doc per route: files, APIs
- [docs/plans/](docs/plans/) — what was planned, and what shipped
- `apps/api/src/__tests__/<feature>.api.test.ts` — the API contract: payloads, responses, error codes
- `docs/` — security and reliability notes
