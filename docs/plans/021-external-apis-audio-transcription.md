# 021 — External API results and audio transcription

**Status:** implemented
**Scope:** backend

## Goal

An audio cell holds an uploaded file and nothing else — the upload request never
transcribes. When an AI column runs over a row that has an audio cell, the
Trigger.dev worker resolves that audio to text first: it looks for a stored
result for that cell and that file, reuses it when one exists, and otherwise
sends the file to the ElevenLabs Speech-to-Text API and stores what comes back.
The transcript, not the audio file, is what the AI node reads.

The store behind that is one generic table, `ExternalApi`, keyed by cell and by
source reference, ready for the next kinds of external processing (PDF → text,
website → markdown, scraping) without a schema change.

## Backend

- **Table `ExternalApi`** — `id`, `cellId` (fk → `Cell`, `onDelete: Cascade`),
  `input` (the source reference: a file URL, a website URL, a file name — not
  unique), `output` (`Json`, the processed result), `createdAt`, `updatedAt`.
  Indexes `[cellId, input]` (the lookup) and `[cellId, createdAt]` (the list).
- **Procedures:** `externalApi.listByCell` (query, `{ cellId }` →
  `ExternalApi[]`, newest first) — the "fetch by cell_id" face. Everything else
  is service-level; the worker is the only writer.
- **Service methods** (`ExternalApiService`):
  - `find(cellId, input)` → the newest matching record, or `null`.
  - `listByCell(cellId)` → every record of a cell, newest first.
  - `save({ cellId, input, output })` → updates the newest matching record or
    creates one; unknown cell → `EXTERNAL_API_CELL_NOT_FOUND`.
  - `resolve(cellId, input, produce)` → `find` or `produce()` + `save`, plus
    `reused`. The one entry point every future processor uses.
- **Audio → text** (`src/ai/`, outside the tRPC graph):
  - `elevenlabs.ts` — `transcribeAudio(file)`; `ELEVENLABS_API_KEY`, lazy like
    `gemini()`. Plain `fetch` + `FormData`, no new dependency.
  - `cell-transcripts.ts` — `collectTranscripts(address, cells, deps)`: every
    audio cell of the row → `externalApiService.resolve` → the stored text or a
    fresh ElevenLabs call. Never throws; a failure is a note.
  - `cell-attachments.ts` — audio drops out of `ATTACHABLE_TYPES`; file and url
    cells still travel as file parts.
  - `cell-prompt.ts` — a `transcribed` note renders the cell line as the
    transcript.
  - `cell-output.ts` — `generateCellValue(input, address)` collects transcripts
    and attachments in parallel and records both on the run's `result`.
- Reused rather than written: `fetchAttachment` / `filenameOf` / `mediaTypeFor`
  (`cell-attachments.ts`), `cellId` + `parseCellId` (`spreadsheet.ids.ts`),
  `isForeignKeyViolation` (`common/prisma-errors.ts`), `toJsonInput`.

## Frontend

None. Audio cells already upload (`POST /files` → the URL in the cell), play and
render; nothing about the upload path changes.

## Decisions

- **Repo naming over the requested literal names.** The request says
  `external_apis` / `cell_id`; the schema is PascalCase models with camelCase
  fields everywhere (`RunAi`, `spreadsheetId`), so the model is `ExternalApi`
  with `cellId`. Same table, repo spelling.
- **A real foreign key with `ON DELETE CASCADE`**, unlike `RunAi.cellId` (a
  plain string, because a run must outlive its cell). A processed result is
  about a cell's *current* content: clearing the cell, deleting its row or
  re-importing the sheet should drop it, and the database does that.
- **`output` is a free JSON object with one required field, `kind`.** The
  discriminator is what keeps the table generic *and* readable — a consumer
  reading a cell's records can tell `audio-transcription` from a future
  `website-markdown` without a second column. Known shapes are declared in
  `external-api.schema.ts`.
- **`input` is not unique and `save` updates the newest match.** Two runs
  racing the same cell could still write two rows; `find` takes the newest, so
  the cache stays correct and the loser is dead weight, not a failure.
- **Audio is transcribed, not attached.** Sending Gemini the audio *and* a
  transcript would pay twice for the same content, and the cache exists to stop
  re-uploading the file on every run. File and url cells are unchanged.
- **A transcription failure degrades, it does not fail the run** — the prompt
  line says the audio could not be transcribed, matching how an unfetchable
  attachment already behaves.
- **The work happens in `run-ai-cell`**, not in a task of its own: it is the
  task that owns one cell's inputs, and a separate task would double the
  round trips for no isolation gain.

## Risks / open questions

- ElevenLabs' response shape is read defensively (`text` required,
  `language_code` optional); a change there surfaces as a transcription failure
  note, not a crash.
- `run-ai-cell`'s `maxDuration` moves 120 s → 300 s: a long recording now shares
  the budget with the model call.

---

## Outcome

- **Shipped:**
  - `apps/api/prisma/schema.prisma` — `ExternalApi` + `Cell.externalApis`;
    migration `20260910000000_add_external_api`.
  - `apps/api/src/modules/external-api/` — `external-api.schema.ts`,
    `external-api.errors.ts`, `external-api.service.ts`.
  - `apps/api/src/trpc/routers/external-api.ts`, registered in `_app.ts`.
  - `apps/api/src/ai/elevenlabs.ts`, `apps/api/src/ai/cell-transcripts.ts`;
    `cell-attachments.ts`, `cell-prompt.ts`, `cell-output.ts` updated.
  - `apps/api/src/trigger/run-ai-cell.ts` — passes the cell address, logs and
    stores `transcripts`.
  - `apps/api/src/__tests__/external-api.api.test.ts` (new contract),
    `run-ai.api.test.ts` (header + transcript/attachment tests).
  - `apps/api/.env.example` — `ELEVENLABS_API_KEY`.
- **Deviated:** nothing material.
- **Not done:** no UI surfaces the stored transcript — the sheet still shows the
  audio chip. Adding it means a `externalApi.listByCell` query in the side
  panel. No other `kind` is implemented; the table and `resolve` are ready for
  them.
- **Docs updated:** `docs/features/external-api.md` (new) + index row,
  `docs/features/run-ai.md`, `docs/features/spreadsheet.md`, `ARCHITECTURE.md`.
