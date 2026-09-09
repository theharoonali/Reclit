import { z } from "zod";

// Single source of truth for the external-api shapes. The table is generic on
// purpose — one row is "some external service turned `input` into `output` for
// this cell" — so the only structure this file imposes is `output.kind`, the
// discriminator that tells a reader of a cell's records what produced each one.
// Known kinds and their output shapes are declared here; the next processor
// (PDF → text, website → markdown) adds a constant and a schema beside them and
// needs nothing else.

/** What produced a record. One per processing kind; free to grow. */
export const EXTERNAL_API_KINDS = {
  /** ElevenLabs Speech-to-Text over an audio cell's file (`src/ai/cell-transcripts.ts`). */
  audioTranscription: "audio-transcription",
} as const;

/**
 * A processed result: any JSON object, as long as it says what kind it is.
 * `catchall` rather than a discriminated union so a new kind is storable and
 * readable before its shape is declared here.
 */
export const externalApiOutputSchema = z
  .object({ kind: z.string().min(1) })
  .catchall(z.unknown());
export type ExternalApiOutput = z.infer<typeof externalApiOutputSchema>;

/**
 * What `src/ai/elevenlabs.ts` stores for an audio cell. The transcript is the
 * point; the rest describes the file it came from, so a later reader can tell
 * whether the record still matches what the cell holds.
 */
export const audioTranscriptionOutputSchema = z.object({
  kind: z.literal(EXTERNAL_API_KINDS.audioTranscription),
  provider: z.string(),
  model: z.string(),
  text: z.string(),
  languageCode: z.string().nullable(),
  filename: z.string(),
  mediaType: z.string(),
  bytes: z.number().int(),
});
export type AudioTranscriptionOutput = z.infer<
  typeof audioTranscriptionOutputSchema
>;

/* ---------------------------------------------------------------- outputs */

export const externalApiSchema = z.object({
  id: z.string(),
  /** Scoped Cell pk "<sheetId>.cell.<r>.<c>" — a real fk, cascade-deleted. */
  cellId: z.string(),
  input: z.string(),
  output: externalApiOutputSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ExternalApi = z.infer<typeof externalApiSchema>;

/* ----------------------------------------------------------------- inputs */

const cellId = z.string().trim().min(1, "cellId is required").max(200);
/**
 * The source the result was produced from: a file URL, a website URL, a file
 * name. Capped where a URL stops being a URL — the payload itself belongs in
 * storage, never in this column.
 */
const input = z.string().trim().min(1, "input is required").max(2000);

/** Router input for `listByCell`. */
export const externalApiCellInput = z.object({ cellId });

/** Service input for `find`; the pair is the cache key. */
export const findExternalApiInput = z.object({ cellId, input });

/** Service input for `save`. In-process callers only — the worker writes these. */
export const saveExternalApiInput = z.object({
  cellId,
  input,
  output: externalApiOutputSchema,
});

export type ExternalApiCellInput = z.infer<typeof externalApiCellInput>;
export type FindExternalApiInput = z.infer<typeof findExternalApiInput>;
export type SaveExternalApiInput = z.infer<typeof saveExternalApiInput>;
