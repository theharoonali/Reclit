# Database Schema (generated)

Source of truth: `apps/api/prisma/schema.prisma`. Regenerate this file whenever
models change ([rules/BACKEND.md](../rules/BACKEND.md)).

Provider: PostgreSQL. Client: Prisma 7 with the `@prisma/adapter-pg` driver
adapter, generated to `apps/api/generated/prisma` (gitignored).

## `Note`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | primary key, `@default(uuid())` |
| `title` | `String` | required |
| `content` | `String` | `@default("")` |
| `createdAt` | `DateTime` | `@default(now())`, indexed |
| `updatedAt` | `DateTime` | `@updatedAt` |

Indexes: `Note_createdAt_idx` on `createdAt` (the list query sorts by it).

Migrations live in `apps/api/prisma/migrations/`.
