import { python } from "@trigger.dev/python";
import { AbortTaskRunError, logger, queue, schemaTask } from "@trigger.dev/sdk";
import type { Converter } from "../ai/cell-markdown";
import {
  converterArgs,
  MARKITDOWN_SCRIPT,
  parseConverterOutput,
  resolveMarkdownRecord,
  UnconvertibleSourceError,
} from "../ai/cell-markdown";
import {
  convertToMarkdownJobSchema,
  documentMarkdownOutputSchema,
} from "../modules/external-api/external-api.schema";

// The general conversion: one file (or YouTube video) → markdown, by
// Microsoft's markitdown in Python, stored in `ExternalApi` under the cell
// that holds the URL and reused from any cell that already has it.
// `run-ai-cell` triggers one per file, audio or YouTube cell of a running row
// whose markdown is not stored yet; anything else that needs a file as text
// (a summary of it, later) triggers it the same way and reads the record back
// by id — the markdown stays in the store, the task returns only what
// happened.
//
// The store is checked before the file is fetched, so a retry after a stored
// result — or a second caller for the same URL — never converts twice. A
// file that holds no text or is too large aborts at once; a fetch or Python
// failure is retried with backoff.

export type ConvertToMarkdownOutcome = {
  recordId: string;
  reused: boolean;
  characters: number;
};

/** A few at a time: each holds a file in memory and a Python process. */
export const markitdownQueue = queue({
  name: "markitdown",
  concurrencyLimit: 5,
});

/** `python/markitdown_convert.py` through the extension's interpreter. */
const runMarkitdown: Converter = async (input) => {
  const result = await python.runScript(
    MARKITDOWN_SCRIPT,
    converterArgs(input),
  );
  return parseConverterOutput(result.stdout);
};

export const convertToMarkdownTask = schemaTask({
  id: "convert-to-markdown",
  schema: convertToMarkdownJobSchema,
  queue: markitdownQueue,
  machine: "small-2x",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 30_000,
    factor: 2,
  },
  run: async ({ cellId, url }): Promise<ConvertToMarkdownOutcome> => {
    try {
      const { record, reused } = await resolveMarkdownRecord(
        { cellId, url },
        { convert: runMarkitdown },
      );
      const output = documentMarkdownOutputSchema.parse(record.output);
      logger.info("converted to markdown", {
        cellId,
        url,
        reused,
        source: output.source,
        mediaType: output.mediaType,
        bytes: output.bytes,
        characters: output.characters,
      });
      return { recordId: record.id, reused, characters: output.characters };
    } catch (error) {
      if (error instanceof UnconvertibleSourceError) {
        throw new AbortTaskRunError(error.message);
      }
      throw error;
    }
  },
});
