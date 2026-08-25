# `<feature>`

> Copy this file for every new backend feature and register it in [index.md](index.md).
> Keep it accurate: changing this feature's table, service, or procedures means
> updating this doc in the same change ([../rules/COMMON.md](../rules/COMMON.md)).

**Purpose:** one line.

**Contract:** `apps/api/src/__tests__/<feature>.api.test.ts` — payloads,
responses, and error codes live in its header. Do not duplicate them here.

## Table `<Model>`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `…` | `…` | required / default / relation |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

Indexes: … · Relations: … · Migrations: `apps/api/prisma/migrations/`

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | … |
| `apps/api/src/modules/<feature>/<feature>.schema.ts` | schema | … |
| `apps/api/src/modules/<feature>/<feature>.service.ts` | service | … |
| `apps/api/src/trpc/routers/<feature>.ts` | router | … |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `<feature>.<proc>` | query/mutation | `<Service>.<method>` | … |

## Behaviour

- Business rules, defaults, ordering, and the limits of what the procedures
  accept. Describe the code as it is — no checklists, no history.

## Reusable pieces

- What to extend rather than duplicate when the next feature needs something similar.

## Used by

- `<route>` ([route doc](../routes/index.md)) — which procedures it calls.
