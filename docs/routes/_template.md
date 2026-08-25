# `<route>`

> Copy this file for every new route and register it in [index.md](index.md).
> Keep it accurate: changing the route's files or APIs means updating this doc in
> the same change ([../rules/COMMON.md](../rules/COMMON.md)).

**Purpose:** one line.

**Rendering:** static | dynamic (`force-dynamic`) — and why.

## Frontend files

| Path | Kind | Responsibility |
| --- | --- | --- |
| `apps/dashboard/src/app/(app)/<route>/page.tsx` | RSC | … |
| `apps/dashboard/src/components/<feature>/<name>.tsx` | client | … |

Shared pieces used: `@reclit/ui/…`, `components/common/…`, `components/layout/…`.

## APIs called

| Procedure | Kind | Called by | Invalidates |
| --- | --- | --- | --- |
| `<feature>.<proc>` | query/mutation | `<component>` | `<feature>.list` |

Payloads and responses: the contract header of
`apps/api/src/__tests__/<feature>.api.test.ts`.
Backend detail: [docs/features/<feature>.md](../features/index.md).
List any procedure this page deliberately does not call.

## Behaviour

- How the page behaves now: states handled, validation surfaced, what the user
  can and cannot do. Describe the code as it is — no checklists, no history.

## Reusable pieces

- What to extend rather than duplicate.

## Linked routes

- `/other` (link to its doc) — how they relate.
