# `user`

**Purpose:** the app's single user — profile name, email and picture; owner of
every workspace. There is no auth: `me` is the first user by `createdAt`.

**Contract:** `apps/api/src/__tests__/user.api.test.ts` — payloads,
responses, and error codes live in its header. Do not duplicate them here.

## Table `User`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `name` | `String` | required, 1..200 trimmed |
| `email` | `String?` | valid email ≤ 320 trimmed; null = no email |
| `imageUrl` | `String?` | http(s) URL ≤ 2048; null = no picture |
| `onboardingCompleted` | `Boolean` | `@default(false)`; set to true only by `POST /onboarding` ([onboarding.md](onboarding.md)) |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

Indexes: none · Relations: `workspaces Workspace[]` (cascade on user delete) ·
Migrations: `apps/api/prisma/migrations/20260831000000_add_user_workspace/`,
`apps/api/prisma/migrations/20260831120000_add_user_email/`,
`apps/api/prisma/migrations/20260925120000_add_user_onboarding_completed/`
(backfills `true` for every user who already owned a workspace)

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `User` |
| `apps/api/src/modules/user/user.schema.ts` | schema | zod inputs + `UserProfile` |
| `apps/api/src/modules/user/user.errors.ts` | errors | `UserNotFoundError` |
| `apps/api/src/modules/user/user.service.ts` | service | `me`, `update`, `completeOnboarding`, `create` (seed-only) |
| `apps/api/src/trpc/routers/user.ts` | router | `me`, `update` |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `user.me` | query | `UserService.me` | — (`USER_NOT_FOUND` only on a never-seeded DB) |
| `user.update` | mutation | `UserService.update` | validation |

## Behaviour

- One user exists, seeded as "Demo User" (`apps/api/prisma/seed.ts`) or
  planted by the 013 backfill migration. `me()` resolves the first user by
  `createdAt` and is the only place that does.
- `update` is partial; `email: null` / `imageUrl: null` clear their fields.
- `onboardingCompleted` is not in `updateUserInput`, so `update` can never
  set it. Only `UserService.completeOnboarding` does, and only
  `onboardingService.complete` calls that. The seed creates the demo user
  with `true` because it seeds the "Customers" workspace too.
- There is no create or remove procedure. `UserService.create` exists for the
  seed only; deleting the user would cascade every workspace.

## Reusable pieces

- When auth arrives, `me()` is the single seam: swap "first user" for "user
  from the request context" and every consumer follows.

## Used by

- Every `(app)` and `(onboarding)` route, through `OnboardingGate`
  ([onboarding route doc](../routes/onboarding.md)): `user.me` decides
  between the dashboard and `/onboarding`.

- `/settings` ([route doc](../routes/settings.md)) — `user.me` (display only;
  `user.update` has no UI surface right now).
- The sidebar's account menu (`components/workspace/account-menu.tsx`) —
  `user.me` for the avatar/name/email trigger.
