# 045 — Files reach the AI as markdown (markitdown)

**Status:** shipped (backend); end-to-end run in the dev worker not yet verified
**Scope:** api worker — `src/ai/`, `src/trigger/`, `python/`, `trigger.config.ts`; one spreadsheet write rule

## Goal

When an AI cell runs, the row's files reach the model as **markdown**, not as
raw file parts. The markdown comes from Microsoft's markitdown (Python) running
in a Trigger.dev task. It is stored in `ExternalApi`, so running again never
extracts again, and it is deleted when the file is.

Formats are everything markitdown reads: PDF, Word, PowerPoint, Excel, images
(EXIF), audio (metadata + speech transcription), HTML, CSV/JSON/XML, ZIP,
EPUB, and YouTube URLs.

A per-file summary in the cell is next. It will read the same stored record.

## Decisions

- **Audio switches to markitdown.** The ElevenLabs path for AI cells
  (`cell-transcripts.ts`) is gone. `elevenlabs.ts` stays because the
  assistant's mic (`POST /assistant/transcribe`) uses it.
- **Images:** the EXIF markdown is stored, and the image is **still attached**
  so the model reads the picture itself.
- **YouTube** links in url columns go to markitdown. Every other URL is still
  crawled by Firecrawl.
- **Fallback:** if a conversion fails, the raw file is attached instead. A
  YouTube page is never attached.
- **One batch:** the crawls and the conversion misses are a single
  `batch.triggerByTaskAndWait`. Trigger.dev refuses two waits at once, and the
  old `Promise.all` of attachments, transcripts and crawls could not grow a
  second waiting branch.
- **Store first:** a running cell reads `ExternalApi` (its own row, else
  another cell's copied under its key) before starting a child run, so a fully
  converted row starts none.
- **Deletion:** clearing the cell already cascaded. Replacing the value was the
  gap: `writeCell` now deletes the cell's rows whose `input` is not the new
  value, in the same transaction.
- Empty markdown means "could not read" (a scanned PDF) and falls back to
  attaching, except for an image, whose empty markdown is stored. Empty
  markdown and files over 25 MB abort the task's retries
  (`UnconvertibleSourceError` → `AbortTaskRunError`).

## Backend

- `python/markitdown_convert.py`, `python/requirements.txt` (`markitdown[all]==0.1.9`).
- `trigger.config.ts`: `pythonExtension` (scripts, requirements, dev
  interpreter `apps/api/.venv`), `ffmpeg()`, `aptGet(libimage-exiftool-perl)`.
  `@trigger.dev/python@4.5.15`.
- `external-api.schema.ts`: kind `document-markdown`,
  `documentMarkdownOutputSchema`, `convertToMarkdownJobSchema`.
- `src/ai/cell-markdown.ts` (new): the processor.
- `src/trigger/convert-to-markdown.ts` (new): the task.
- `src/ai/cell-output.ts`: `resolveRowSources`, `SourceResolver`, `cellsToAttach`, `notesOf`.
- `src/ai/cell-prompt.ts`: the `converted` note and content blocks.
- `src/trigger/run-ai-cell.ts`: `sourcesViaTask`.
- `src/ai/cell-crawls.ts`: YouTube excluded, `crawlKeys`.
- `src/ai/cell-attachments.ts`: `fetchFile` takes a size cap, plus `fetchAttachments`.
- `spreadsheet-cells.service.ts`: prune on replace.
- Run results swap `result.transcripts` for `result.conversions`.

## Outcome

- Typecheck clean; biome clean.
- Contracts:
  - `run-ai.api.test.ts`: 13 new conversion and prompt cases, using fake
    converter, store and resolver.
  - `external-api.api.test.ts`: the `document-markdown` shape in the header,
    plus a replace-prunes and same-value-keeps case (17/17 against the DB).
- The Python script was smoke-tested on CSV in the local venv.
- **Not verified yet:** a real run through the Trigger.dev dev worker (the
  `convert-to-markdown` child run, `reused: true` on a re-run), and the deploy
  image build. Deploy is blocked until the CI Trigger.dev token is set.
- **Known risk:** markitdown's audio transcription uses Google's free Web
  Speech API. Long recordings may fail or come back partial. A hard failure
  falls back to attaching the audio; a partial transcript does not.
