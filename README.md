# Monorepo Skeleton

A Bun + Turborepo monorepo skeleton with a Next.js frontend and a Hono/tRPC backend.

## Stack

- **Runtime / package manager:** [Bun](https://bun.sh)
- **Monorepo:** [Turborepo](https://turborepo.dev) with Bun workspaces
- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind + shadcn-style UI kit
- **Backend:** Hono + tRPC 11 + OpenAPI (Scalar docs)
- **Database:** Postgres via Drizzle ORM
- **Auth:** Supabase
- **Lint/format:** Biome

## Structure

| Path | Description |
| --- | --- |
| `apps/api` | Hono + tRPC API server (port 3003) |
| `apps/dashboard` | Next.js web app (port 3001) |
| `packages/ui` | Shared UI component library (shadcn/Radix) |
| `packages/db` | Drizzle ORM client, schema, migrations |
| `packages/supabase` | Supabase auth clients (server/client/middleware) |
| `packages/trpc` | Shared tRPC client helpers |
| `packages/logger` | Pino logger |
| `packages/encryption` | Encryption helpers |
| `packages/health` | Health check probes |
| `packages/utils` | Shared utilities |
| `packages/tsconfig` | Shared TypeScript configs |

## Getting started

```bash
bun install
cp apps/api/.env.example apps/api/.env
cp apps/dashboard/.env.example apps/dashboard/.env
bun dev
```

- API: http://localhost:3003 (Scalar API docs at `/`)
- Dashboard: http://localhost:3001

See [CLAUDE.md](CLAUDE.md) for development conventions and commands.
