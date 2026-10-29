# `auth`

**Purpose:** env-backed login for the one dummy user — no table, no signup; a
stateless signed cookie is the session, and `DEV=TRUE` bypasses it entirely.

**Contract:** `apps/api/src/__tests__/auth.api.test.ts` — payloads,
responses, error codes and every client-visible behaviour live in its header.
Do not duplicate them here.

## Table

None. The credentials are `AUTH_EMAIL` / `AUTH_PASSWORD` env vars; after
login, `user.me` keeps resolving the single seeded database user. A real
account table replaces this feature when signup arrives.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/src/modules/auth/auth.schema.ts` | schema | `loginInput`, `Session` |
| `apps/api/src/modules/auth/auth.errors.ts` | errors | `INVALID_CREDENTIALS` (401), `AUTH_NOT_CONFIGURED` (503) |
| `apps/api/src/modules/auth/auth.service.ts` | service | env credential check (constant-time), HMAC session token, `devMode()` |
| `apps/api/src/trpc/routers/auth.ts` | router | `session` / `login` / `logout`; writes the cookie through the context |
| `apps/api/src/trpc/init.ts` | context | parses the `reclit_session` cookie into `ctx.authenticated`; `protectedProcedure`; cookie setters |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `auth.session` | query | — (reads ctx) | — |
| `auth.login` | mutation | `AuthService.login` | BAD_REQUEST, UNAUTHORIZED, SERVICE_UNAVAILABLE |
| `auth.logout` | mutation | — (clears cookie) | — |

## Behaviour

- The session token is `HMAC-SHA256("reclit-session-v1", secret)` where the
  secret is `AUTH_SECRET`, defaulting to the credential pair. It is stateless:
  changing the env vars invalidates every session, and there is nothing to
  revoke per-user because there is one user.
- `createTRPCContext` computes `authenticated` once per request:
  `DEV=TRUE` (case-insensitive) or a cookie that verifies. The test caller
  constructs the context directly (`{ authenticated: true, devMode: false }`
  in `__tests__/support/trpc.ts`), so contract tests need no env staging.
- `protectedProcedure` guards only the `user` router so far. Every `(app)` and
  `(onboarding)` page blocks on `user.me` through the dashboard's gate, which
  is what forces login for the whole UI; the other routers and all REST routes
  are still public — see [docs/SECURITY.md](../SECURITY.md).
- CORS now sends `credentials: true` (`bootstrap.ts`), and the dashboard's
  tRPC links send `credentials: "include"` / `withCredentials` — the cookie
  must cross :4000 → :4001.

## Reusable pieces

- `protectedProcedure` (`src/trpc/init.ts`) — use it for any procedure that
  should require a session.
- The `unauthorized` DomainError kind maps to tRPC `UNAUTHORIZED` / HTTP 401
  for any future auth error.

## Used by

- `/login` ([route doc](../routes/login.md)) — `auth.session`, `auth.login`.
- Every gated route — the gate redirects to `/login` on `user.me`
  UNAUTHORIZED; the account menu calls `auth.logout`.
