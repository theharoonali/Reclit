# Security

Current posture of the template (from the code as it stands).

## Auth

**There is no authentication.** All tRPC procedures are `publicProcedure`; both
REST endpoints are open. When auth is added, introduce a `protectedProcedure` in
`apps/api/src/trpc/init.ts` that reads the request in `createTRPCContext`.

## CORS

Configured in `apps/api/src/bootstrap.ts` via Nest's `enableCors`:
- Origins: `ALLOWED_API_ORIGINS` (comma-separated), default `http://localhost:3001`.
- Allowed headers: `Authorization`, `Content-Type`, `x-trpc-source`, `trpc-accept`.

## Headers

The dashboard sets `X-Frame-Options: DENY` on all routes (`next.config.ts`).

## Secrets

No secrets are required to run the template. `.env` files are gitignored;
`.env.example` files list the (non-secret) variables.
