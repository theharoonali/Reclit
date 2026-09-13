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
  /** A Firecrawl crawl of a url cell's website (`src/ai/cell-crawls.ts`). */
  websiteCrawl: "website-crawl",
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

/** One crawled page: the URL it ended up at (the "output url"), and its main content as markdown. */
export const crawledPageSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  statusCode: z.number().int().nullable(),
  characters: z.number().int(),
  markdown: z.string(),
});
export type CrawledPage = z.infer<typeof crawledPageSchema>;

/**
 * What `src/ai/firecrawl.ts` stores for a url cell: the requested URL (the
 * row's `input`), the options the crawl ran with, and every page it found.
 * The pages are the point; the counters and `creditsUsed` say what the crawl
 * cost, so a stored row can be judged without reading Firecrawl's dashboard.
 */
export const websiteCrawlOutputSchema = z.object({
  kind: z.literal(EXTERNAL_API_KINDS.websiteCrawl),
  provider: z.string(),
  crawlId: z.string(),
  url: z.string(),
  options: z.object({
    limit: z.number().int(),
    maxDiscoveryDepth: z.number().int(),
    allowSubdomains: z.boolean(),
    crawlEntireDomain: z.boolean(),
  }),
  pages: z.array(crawledPageSchema),
  total: z.number().int(),
  completed: z.number().int(),
  creditsUsed: z.number().int().nullable(),
  /** ISO 8601. */
  crawledAt: z.string(),
});
export type WebsiteCrawlOutput = z.infer<typeof websiteCrawlOutputSchema>;

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

/**
 * The `crawl-website` Trigger.dev task's payload (`src/trigger/crawl-website.ts`):
 * the cell whose URL it is — the store key — and the URL to crawl.
 */
export const crawlWebsiteJobSchema = z.object({ cellId, url: input });

export type ExternalApiCellInput = z.infer<typeof externalApiCellInput>;
export type FindExternalApiInput = z.infer<typeof findExternalApiInput>;
export type SaveExternalApiInput = z.infer<typeof saveExternalApiInput>;
export type CrawlWebsiteJob = z.infer<typeof crawlWebsiteJobSchema>;
