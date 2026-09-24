# `file`

**Purpose:** stateless multipart upload into the public Supabase Storage bucket
`reclit`, returning a permanent public URL — used by audio and file cells —
and deletion of such an upload by that URL.

**Contract:** `apps/api/src/__tests__/file.api.test.ts` — payloads, responses,
and error codes live in its header. Do not duplicate them here.

## Table

None. Nothing tracks uploads; the URL stored in a cell is the only record the
file exists.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/src/modules/file/file.schema.ts` | schema | `uploadedFileSchema`, `deleteFileInput`, `deletedFileSchema` |
| `apps/api/src/modules/file/file.service.ts` | service | lazy Supabase client, `upload()`, `remove()`, pure `uploadPathFromUrl()` |
| `apps/api/src/modules/file/file.errors.ts` | errors | `FileStorageNotConfiguredError`, `FileUploadFailedError`, `FileUrlNotDeletableError`, `FileDeleteFailedError` |
| `apps/api/src/modules/file/file.controller.ts` | controller | `POST /files` — the multipart plumbing is shared (`common/upload.ts`: `@UploadFile()` + `requireFile()`, 25 MB); `DELETE /files` — JSON `{ url }` |

## Procedures

REST only — multipart does not belong on the tRPC link.

| Route | Service method | Errors |
| --- | --- | --- |
| `POST /files` | `FileService.upload` | 400, 502 upstream, 503 unconfigured |
| `DELETE /files` | `FileService.remove` | 400, 502 upstream, 503 unconfigured |

## Behaviour

- Object path `uploads/<uuid>/<sanitized-name>` keeps the original filename as
  the URL's last path segment (the sheet's chip label).
- `SUPABASE_URL` / `SUPABASE_KEY` live in `apps/api/.env`; the client is
  created lazily so a checkout without them still boots (both routes 503).
- `remove` only ever deletes what `upload` wrote. `uploadPathFromUrl` requires
  the URL to start with the bucket's own public base and the rest to match
  `uploads/<uuid>/<name>` exactly — the character set `sanitizeName` produces —
  so another host, another folder, a folder-level path or `..` is refused
  before storage is called.
- Supabase answers a delete of a missing path — and one the key's RLS denies —
  with an empty list and no error. That is reported as `removed: false`, which
  makes the route idempotent; the contract test asserts `removed: true` right
  after an upload, which is what catches a key without delete rights.
- `remove` does **not** check whether a cell still stores the URL: `Cell.value`
  is unindexed JSON, and the only caller deletes draft uploads that no row
  references yet.

## Reusable pieces

- `FileService.upload(buffer, name, mimeType)` for any future feature that
  stores a file, and `FileService.remove(url)` to take it back.

## Used by

- `/ai-spreadsheet` ([route doc](../routes/ai-spreadsheet.md)) — the audio and
  file panels upload through `POST /files` and store the URL via
  `spreadsheet.setCell`.
- `/form/[spreadsheetId]` ([route doc](../routes/form.md)) — uploads on pick,
  deletes on remove or replace.
