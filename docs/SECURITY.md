# Security

Security posture of the template.

## Auth

**There is no authentication.** Every tRPC procedure is `publicProcedure` and
every REST route (`GET /health`, `/spreadsheets/*`, `/populate/*`,
`POST /files`, `DELETE /files`) is open.
When auth is added, introduce a `protectedProcedure` in
`apps/api/src/trpc/init.ts` that reads the request in `createTRPCContext`, and
a Nest guard for the controllers.

Two open routes deserve naming, because they are *meant* for outsiders:

- **`POST /populate/:id`** (and `populate.submit`) is a public write API: anyone
  who knows a spreadsheet id can append rows, and each row starts the sheet's
  AI columns — which spend credits. There is **no rate limit**. The id is a
  uuid, which is the only thing standing in for a secret.
- **`DELETE /files`** deletes an upload by its public URL. It is confined to
  `uploads/<uuid>/<name>` in the bucket (another host, folder or `..` is
  refused), but anyone holding such a URL — including one a cell still
  references, and cells are readable — can delete it. The uuid in the path is
  the only mitigation until auth exists.

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
`TRIGGER_SECRET_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are optional: without
them uploads answer 503, runs stay `pending`, and the worker fails a run with
a clear message. `.env` files are gitignored; `.env.example` lists every
variable with a placeholder.
