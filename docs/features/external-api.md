# `external-api`

**Purpose:** one generic store for everything an external service produces from
a cell's content — audio → text today, PDF → text, website → markdown, file
processing and scraping next — keyed by the cell and by the source it was
produced from, so a run reuses a result instead of paying for it again.

**Contract:** `apps/api/src/__tests__/external-api.api.test.ts` — payloads,
responses, the `output.kind` shapes and error codes live in its header. Do not
duplicate them here.

## Table `ExternalApi`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `cellId` | `String` | fk → `Cell.id` (scoped `"<sheetId>.cell.<r>.<c>"`), **`onDelete: Cascade`** |
| `input` | `String` | the source the result came from — file URL, website URL, file name. **Not unique**: a cell may have several sources |
| `output` | `Json` | required object; `output.kind` says what produced it, the rest is the kind's own shape |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

Indexes: `[cellId, input]` (the lookup), `[cellId, createdAt]` (the list) ·
Relations: `Cell` (cascade) · Migrations:
`apps/api/prisma/migrations/20260910000000_add_external_api/`

`cellId` is a **real foreign key**, unlike `RunAi.cellId`
([run-ai.md](run-ai.md)), and the difference is deliberate: a run is a record of
something that happened and must outlive its cell, while a processed result
describes the cell's *current* content and is worthless once that content is
gone. Nothing deletes these rows in code — the constraint does it, from every
path that deletes a `Cell`: clearing the cell, deleting the row, deleting the
column, deleting the sheet, or re-importing.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `ExternalApi`, `Cell.externalApis` |
| `apps/api/src/modules/external-api/external-api.schema.ts` | schema | `ExternalApi`, `externalApiOutputSchema` (`{ kind }` + free JSON), `EXTERNAL_API_KINDS`, `audioTranscriptionOutputSchema`, the inputs |
| `apps/api/src/modules/external-api/external-api.errors.ts` | errors | `ExternalApiNotFoundError`, `ExternalApiCellNotFoundError` |
| `apps/api/src/modules/external-api/external-api.service.ts` | service | `find`, `listByCell`, `byId`, `save`, `resolve` |
| `apps/api/src/trpc/routers/external-api.ts` | router | `byId`, `listByCell` |

Its one processor today lives outside the tRPC graph, with the rest of the
worker's code:

| Path | Responsibility |
| --- | --- |
| `apps/api/src/ai/elevenlabs.ts` | `transcribeAudio(file)` — one multipart POST to ElevenLabs Speech-to-Text (`scribe_v1`), `ELEVENLABS_API_KEY`, no SDK |
| `apps/api/src/ai/cell-transcripts.ts` | `collectTranscripts(address, cells, deps)` — every audio cell of a row through `resolve`; `isTranscribableCell`, `summariseTranscripts` |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `externalApi.byId` | query | `ExternalApiService.byId` | `EXTERNAL_API_NOT_FOUND`, validation |
| `externalApi.listByCell` | query | `ExternalApiService.listByCell` | validation |

Read-only. There is no create, update or remove procedure: the writers are
in-process processors, and deletion is the foreign key's.

## Behaviour

- **`resolve` is the whole feature.** A processor never calls `find` and `save`
  itself:

  ```ts
  const { record, reused } = await externalApiService.resolve(
    { cellId, input: url },   // the cache key
    () => produce(),          // only runs on a miss
    isTranscript,             // what counts as a hit
  );
  ```

  `accept` is what keeps a stale row from winning: a record of another kind, or
  of a shape the caller no longer understands, is re-produced and replaces the
  old one instead of being handed back. Omitted, any stored row is a hit.
- **`save` replaces rather than appends.** `input` carries no unique
  constraint — a cell may hold several sources, and a future kind may want
  several results from one — so `save` updates the newest row under
  `(cellId, input)` and creates only when there is none. Two workers racing the
  same key can still leave two rows; `find` takes the newest, so the cache stays
  correct and the loser is dead weight rather than a failure.
- **The table is generic; `output.kind` is the discriminator.** A new kind adds
  a constant and a schema to `external-api.schema.ts` and nothing else — no
  column, no migration. The shapes are declared in one place so two processors
  cannot invent two spellings of the same result.
- **Nothing about audio is in the service.** The transcription path lives in
  `src/ai/`, where the ElevenLabs call sits, because `src/modules/**` and
  `src/trpc/**` are transpiled into the dashboard build
  ([BACKEND.md](../rules/BACKEND.md) hard rule 1) and the provider has no
  business there.

## Reusable pieces

- `resolve` — the entry point for the next processor (PDF → text, website →
  markdown, scraping). Give it a cell id, a source reference, a producer and an
  `accept`, and add the output shape to `EXTERNAL_API_KINDS`.
- `cell-transcripts.ts` is the worked example of a processor: a predicate for
  the cells it handles, a `produce` that fetches then calls the provider, a
  `collect*` that runs the row's cells in parallel and never throws, and a
  `summarise*` that records what happened without the content.

## Used by

- The `run-ai-cell` Trigger.dev task ([run-ai.md](run-ai.md)) — every audio cell
  of a running row is resolved to a transcript before the model is asked.
- No page reads it yet; `externalApi.listByCell` is the face a UI would use.
