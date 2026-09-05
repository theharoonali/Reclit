# Security

Security posture of the template.

## Auth

**There is no authentication.** Every tRPC procedure is `publicProcedure` and
every REST route (`GET /health`, `/spreadsheets/*`, `POST /files`) is open.
When auth is added, introduce a `protectedProcedure` in
`apps/api/src/trpc/init.ts` that reads the request in `createTRPCContext`, and
a Nest guard for the controllers.

## CORS

Configured in `apps/api/src/bootstrap.ts` via Nest's `enableCors`:

- Origins: `ALLOWED_API_ORIGINS` (comma-separated), default `http://localhost:4000`.
- Allowed headers: `Authorization`, `Content-Type`, `x-trpc-source`,
  `trpc-accept`, `Last-Event-ID` (sent by the browser's `EventSource` when a
  tRPC subscription reconnects).

## Input

Every request body, path param and query string is parsed by the feature's zod
schema before a service sees it — automatically in tRPC (`.input()`), explicitly
in controllers (`schema.parse`). Uploads are capped at 25 MB
(`MAX_UPLOAD_BYTES`, `apps/api/src/common/multipart.ts`) and held in memory.

## Headers

The dashboard sets `X-Frame-Options: DENY` on all routes (`next.config.ts`).

## Secrets

`DATABASE_URL` is the one required secret. `SUPABASE_KEY`,
`TRIGGER_SECRET_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are optional: without
them uploads answer 503, runs stay `pending`, and the worker fails a run with
a clear message. `.env` files are gitignored; `.env.example` lists every
variable with a placeholder.
