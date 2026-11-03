# 039 — Env-backed login screen

## Goal

A simple login screen for a single dummy user whose credentials live in env
(`AUTH_EMAIL` / `AUTH_PASSWORD`) — no new tables, no signup — plus a `DEV=TRUE`
env flag that skips credentials entirely and auto-authenticates as that user.

## Plan

- **Backend** (`apps/api`): `modules/auth/` (schema, errors, service — env
  credential check, stateless HMAC session token, `devMode()`); new
  `unauthorized` DomainError kind (tRPC `UNAUTHORIZED`, HTTP 401);
  `createTRPCContext` reads `{ req, res }` and the `reclit_session` cookie into
  `ctx.authenticated`; `protectedProcedure`; `auth` router
  (`session`/`login`/`logout`); `user` router protected; CORS
  `credentials: true`; env additions to `.env.example`; contract test
  `auth.api.test.ts`.
- **Frontend** (`apps/dashboard`): tRPC links send credentials; new `(auth)`
  route group with `/login` (centred card, `FormField` + `Input` + `Button`);
  the gate redirects to `/login` on `user.me` UNAUTHORIZED; the account menu's
  log-out item calls `auth.logout`; `login` message namespace.
- **Docs**: `docs/features/auth.md`, `docs/routes/login.md`, index rows,
  SECURITY.md Auth section.

## Outcome

Shipped as planned. `auth.session` / `auth.login` / `auth.logout` are live
(contract: `apps/api/src/__tests__/auth.api.test.ts`, 16 tests); only the
`user` router is protected, which gates the whole dashboard because every
route group blocks on `user.me`. REST stays open (SECURITY.md). The test
caller context moved from `{}` to `{ authenticated: true, devMode: false }`
in `__tests__/support/trpc.ts`. With `DEV=TRUE` the login screen forwards
straight to `/`; with credentials configured, login/logout round-trips the
signed cookie across :4000 → :4001 (CORS credentials + `credentials:
"include"` on the links).
