# `file`

**Purpose:** stateless multipart upload into the public Supabase Storage bucket
`reclit`, returning a permanent public URL — used by audio cells.

**Contract:** `apps/api/src/__tests__/file.api.test.ts` — payloads, responses,
and error codes live in its header. Do not duplicate them here.

## Table

None. Nothing tracks uploads; the URL stored in a cell is the only record the
file exists. There is no delete.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/src/modules/file/file.schema.ts` | schema | `uploadedFileSchema` |
| `apps/api/src/modules/file/file.service.ts` | service | lazy Supabase client, `upload()` |
| `apps/api/src/modules/file/file.errors.ts` | errors | `FileStorageNotConfiguredError`, `FileUploadFailedError` |
| `apps/api/src/modules/file/file.controller.ts` | controller | `POST /files` — the multipart plumbing is shared (`common/upload.ts`: `@UploadFile()` + `requireFile()`, 25 MB) |

## Procedures

REST only — multipart does not belong on the tRPC link.

| Route | Service method | Errors |
| --- | --- | --- |
| `POST /files` | `FileService.upload` | 400, 502 upstream, 503 unconfigured |

## Behaviour

- Object path `uploads/<uuid>/<sanitized-name>` keeps the original filename as
  the URL's last path segment (the sheet's chip label).
- `SUPABASE_URL` / `SUPABASE_KEY` live in `apps/api/.env`; the client is
  created lazily so a checkout without them still boots (uploads 503).

## Reusable pieces

- `FileService.upload(buffer, name, mimeType)` for any future feature that
  stores a file.

## Used by

- `/ai-spreadsheet` ([route doc](../routes/ai-spreadsheet.md)) — the audio
  panel uploads through `POST /files` and stores the URL via
  `spreadsheet.setCell`.
