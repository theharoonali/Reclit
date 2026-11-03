# Security

Security posture of the template.

## Auth

**Auth is a single env-backed login** ([docs/features/auth.md](features/auth.md)):
`auth.login` checks `AUTH_EMAIL` / `AUTH_PASSWORD` and answers a stateless
signed token that expires after 7 days; the client sends it as
`Authorization: Bearer <token>` (subscriptions: `connectionParams.token`), and
the same token is also set as an httpOnly SameSite=Lax cookie. `DEV=TRUE`
authenticates every request with no credentials — never set it in production.
Rotating `AUTH_SECRET` (or the password) revokes every token.

Every tRPC procedure is `protectedProcedure` except `auth.*` and the public
form's `populate.form`, `populate.submit` and `runAi.onChange`; the Nest
`AuthGuard` (`apps/api/src/common/auth.guard.ts`) covers `/spreadsheets/*`,
`/onboarding/*`, `POST /assistant/transcribe` and `DELETE /files`. Still
open: `GET /health`, `POST /files` and `/populate/*`.

The open routes are open on purpose — they serve the public form:

- **`POST /populate/:id`** (and `populate.submit`) is a public write API: anyone
  who knows a spreadsheet id can append rows, and each row starts the sheet's
  AI columns — which spend credits. There is **no rate limit**. The id is a
  uuid, which is the only thing standing in for a secret.
- **`POST /files`** stores any upload (≤ 15 MB) so a form visitor can attach
  files; nothing ties an upload to a sheet, and there is no rate limit.
- **`runAi.onChange`** streams the AI runs of any sheet whose id is known, so
  the form can show its row's AI columns filling in.

## CORS

Configured in `apps/api/src/bootstrap.ts` via Nest's `enableCors`:

- Origins: `ALLOWED_API_ORIGINS` (comma-separated), default `http://localhost:4000`.
- Allowed headers: `Authorization`, `Content-Type`, `x-trpc-source`,
  `trpc-accept`, `Last-Event-ID` (sent by the browser's `EventSource` when a
  tRPC subscription reconnects).

The allowlist covers REST and tRPC alike. The Populate API is therefore
callable server-to-server from anywhere (CORS is a browser rule), but a browser
on another origin is refused until that origin is added to
`ALLOWED_API_ORIGINS` — which also opens every other route to it.

## Input

Every request body, path param and query string is parsed by the feature's zod
schema before a service sees it — automatically in tRPC (`.input()`), explicitly
in controllers (`schema.parse`). Uploads are capped at 25 MB
(`MAX_UPLOAD_BYTES`, `apps/api/src/common/multipart.ts`) and held in memory.

## Headers

The dashboard sets `X-Frame-Options: DENY` on all routes (`next.config.ts`).

## Secrets

`DATABASE_URL` is the one required secret. `SUPABASE_KEY`,
`TRIGGER_SECRET_KEY` and `AI_API_KEY` are optional: without
them uploads answer 503, runs stay `pending`, the worker fails a run with a
clear message and the dashboard's AI recommendations answer 503
(`SERVICE_UNAVAILABLE`). `.env` files are gitignored; `.env.example` lists
every variable with a placeholder.
