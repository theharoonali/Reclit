# `auth`

**Purpose:** env-backed login for the one dummy user — no table, no signup; a
stateless signed, expiring token is the session (sent as a bearer token, and
also set as a cookie), and `DEV=TRUE` bypasses it entirely.

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
| `apps/api/src/modules/auth/auth.errors.ts` | errors | `INVALID_CREDENTIALS` (401), `AUTH_NOT_CONFIGURED` (503), `LOGIN_REQUIRED` (401, REST) |
| `apps/api/src/modules/auth/auth.service.ts` | service | env credential check (constant-time), issues / verifies the expiring token, `devMode()`, `SESSION_TTL_MS` |
| `apps/api/src/modules/auth/auth.request.ts` | helper | `requestToken(headers, connectionParamsToken)` — bearer header, then subscription param, then cookie; shared by tRPC and REST |
| `apps/api/src/trpc/routers/auth.ts` | router | `session` / `login` (answers the token, sets the cookie) / `logout` |
| `apps/api/src/trpc/init.ts` | context | `ctx.authenticated` from `requestToken`; `protectedProcedure`; cookie setters |
| `apps/api/src/common/auth.guard.ts` | REST guard | `AuthGuard` — the same check for Nest controllers |
| `apps/dashboard/src/lib/auth-token.ts` | client | the token in localStorage; `authHeaders()` for every call |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `auth.session` | query | — (reads ctx) | — |
| `auth.login` | mutation | `AuthService.login` | BAD_REQUEST, UNAUTHORIZED, SERVICE_UNAVAILABLE |
| `auth.logout` | mutation | — (clears cookie; the client forgets its token) | — |

## Behaviour

- The token is `v1.<expiresAtMs>.<hmac>`: HMAC-SHA256 over `v1.<expiresAtMs>`
  with `AUTH_SECRET`, defaulting to the credential pair, valid 7 days
  (`SESSION_TTL_MS`). The expiry is signed, so it cannot be pushed out; each
  login issues a new token. It is stateless: changing `AUTH_SECRET` or the
  password revokes every token at once, and there is nothing to revoke
  per-user because there is one user.
- A request's token comes from, in order: `Authorization: Bearer <token>`,
  a subscription's `connectionParams.token` (a browser EventSource cannot
  send headers), then the `reclit_session` cookie. The bearer header is what
  lets a dashboard on another site (a `*.vercel.app` preview) call the API —
  the SameSite=Lax cookie only travels same-site.
- `createTRPCContext` computes `authenticated` once per request:
  `DEV=TRUE` (case-insensitive) or a token that verifies. The test caller
  constructs the context directly (`{ authenticated: true, devMode: false }`
  in `__tests__/support/trpc.ts`), so contract tests need no env staging.
- Every router uses `protectedProcedure` except `auth.*` and the public
  form's `populate.form`, `populate.submit` and `runAi.onChange`. REST:
  `AuthGuard` covers `/spreadsheets/*`, `/onboarding/*`,
  `POST /assistant/transcribe` and `DELETE /files`; `POST /files` (public form
  attachments) and `/populate/*` stay public.
- The dashboard keeps the token in localStorage (`lib/auth-token.ts`): the
  login form stores it, the account menu's logout clears it, and the tRPC
  links (`headers`, subscription `connectionParams`) and `lib/api-fetch.ts`
  send it. The links still send `credentials: "include"` so the cookie keeps
  working where the browser sends it (local dev, :4000 → :4001).

## Reusable pieces

- `protectedProcedure` (`src/trpc/init.ts`) — the default for any new
  procedure; `publicProcedure` only for what an anonymous visitor needs.
- `AuthGuard` (`src/common/auth.guard.ts`) — `@UseGuards(AuthGuard)` on any
  REST controller or route that needs a session.
- The `unauthorized` DomainError kind maps to tRPC `UNAUTHORIZED` / HTTP 401
  for any future auth error.

## Used by

- `/login` ([route doc](../routes/login.md)) — `auth.session`, `auth.login`.
- Every gated route — the gate redirects to `/login` on `user.me`
  UNAUTHORIZED; the account menu calls `auth.logout`.
