# `<route>`

> Copy this file for every new route and register it in [index.md](index.md).
> Keep it accurate: changing the route's files or APIs means updating this doc in
> the same change ([../rules/COMMON.md](../rules/COMMON.md)).

**Purpose:** one line.

**Rendering:** static | dynamic (`force-dynamic`) — and why.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/<route>/page.tsx` | RSC | … |
| `apps/dashboard/src/components/<name>.tsx` | client | … |

## Backend files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/src/modules/<feature>/<feature>.schema.ts` | schema | … |
| `apps/api/src/modules/<feature>/<feature>.service.ts` | service | … |
| `apps/api/src/trpc/routers/<feature>.ts` | router | … |

## APIs called

| Procedure | Type | Input | Output | Service method | Table |
| --- | --- | --- | --- | --- | --- |
| `<feature>.<proc>` | query/mutation | … | … | `<Service>.<method>` | `<Table>` |

REST equivalents (not used by this page): …

## Implemented

- [x] …

## Not implemented

- [ ] … — where it would go if added.

## Reusable pieces

- What to extend rather than duplicate.

## Linked routes

- [`/other`](other.md) — how they relate.
