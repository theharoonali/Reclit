import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { describeError } from "../common/errors";
import { MAX_UPLOAD_BYTES } from "../common/multipart";
import type {
  DocumentMarkdownOutput,
  ExternalApi,
  ExternalApiOutput,
} from "../modules/external-api/external-api.schema";
import {
  documentMarkdownOutputSchema,
  EXTERNAL_API_KINDS,
} from "../modules/external-api/external-api.schema";
import type { ExternalApiService } from "../modules/external-api/external-api.service";
import { externalApiService } from "../modules/external-api/external-api.service";
import type { RunAiInputCell } from "../modules/run-ai/run-ai.schema";
import type { CellAddress } from "../modules/spreadsheet/spreadsheet.ids";
import { cellId } from "../modules/spreadsheet/spreadsheet.ids";
import type { FetchLike } from "./cell-attachments";
import { fetchFile, filenameOf, isUrlCell } from "./cell-attachments";

// A file reaches the model as markdown, not as bytes: before a cell runs,
// every file and audio cell of its row — and every url cell that points at a
// YouTube video — is converted by Microsoft's markitdown (PDF, Word,
// PowerPoint, Excel, images, audio, HTML, CSV/JSON/XML, ZIP, EPUB, …). The
// result is cached in the generic `ExternalApi` table under the source cell's
// own scoped id plus its URL, so a row that runs through five AI columns, or
// one AI column five times, converts its file once. Clearing or replacing the
// file deletes the record (docs/features/external-api.md).
//
// markitdown is Python, so it runs in its own Trigger.dev task
// (`src/trigger/convert-to-markdown.ts`) while this file stays SDK-free — the
// crawl's two layers (cell-crawls.ts): `resolveMarkdownRecord` is what the
// task runs (store → fetch → convert), with the Python call injected as a
// `Converter`; `planConversions` + `conversionsFrom` are what a running cell
// uses around a `MarkdownResolver` — the task backs it with a batch of child
// runs, the contract test with a Map. The store is read first, so a row whose
// files are all converted starts no child run at all.
//
// Nothing here throws to the cell. A file that cannot be converted becomes a
// failure, and the cell attaches the file itself instead (cell-output.ts).

/** Column types whose file is converted rather than attached. */
const CONVERTIBLE_FILE_TYPES = new Set(["file", "audio"]);
/** Column types whose URL is converted when it is a YouTube video (others are crawled). */
const CONVERTIBLE_LINK_TYPES = new Set(["url"]);
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

/** The fetch cap: the upload cap, since the bytes are not sent to the model. */
export const MAX_CONVERT_BYTES = MAX_UPLOAD_BYTES;
/** The prompt's budget for one cell's markdown; the store keeps all of it. */
export const MAX_MARKDOWN_PROMPT_CHARS = 60_000;
/** The script `pythonExtension` ships (trigger.config.ts), relative to apps/api. */
export const MARKITDOWN_SCRIPT = "./python/markitdown_convert.py";

export function isYoutubeUrl(value: string): boolean {
  try {
    return YOUTUBE_HOSTS.has(new URL(value).host.toLowerCase());
  } catch {
    return false;
  }
}

export function isConvertibleCell(
  cell: RunAiInputCell,
): cell is RunAiInputCell & { value: string } {
  return (
    isUrlCell(cell, CONVERTIBLE_FILE_TYPES) ||
    (isUrlCell(cell, CONVERTIBLE_LINK_TYPES) && isYoutubeUrl(cell.value))
  );
}

/** Whether the model should also see the file itself: an image's markdown is only its metadata. */
export const isImageMediaType = (mediaType: string): boolean =>
  mediaType.startsWith("image/");

/* -------------------------------------------------------------- converter */

/** What the Python script is handed: a local copy of a fetched file, or a YouTube URL. */
export type ConvertInput = { path: string; filename: string } | { url: string };
/** What it answers (one JSON line on stdout). */
export type ConvertResult = {
  markdown: string;
  title: string | null;
  version: string;
};
/** The Python seam: the task runs the script, the contract test fakes it. */
export type Converter = (input: ConvertInput) => Promise<ConvertResult>;

/** The script's arguments for one input. */
export function converterArgs(input: ConvertInput): string[] {
  return "url" in input
    ? ["--url", input.url]
    : ["--path", input.path, "--name", input.filename];
}

/** The script's stdout as a `ConvertResult`, or a throw naming what it printed instead. */
export function parseConverterOutput(stdout: string): ConvertResult {
  const line = stdout.trim().split("\n").pop() ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(
      `markitdown printed no result: ${line.slice(0, 200) || "(nothing)"}`,
    );
  }
  const { markdown, title, version } = (parsed ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof markdown !== "string") {
    throw new Error("markitdown's result has no markdown");
  }
  return {
    markdown,
    title: typeof title === "string" && title.trim() ? title.trim() : null,
    version: typeof version === "string" ? version : "unknown",
  };
}

const converterUnavailable: Converter = async () => {
  throw new Error(
    "markdown conversion runs in the convert-to-markdown task; no converter was given",
  );
};

/**
 * A failure retrying cannot fix — the file holds no text, or is too large.
 * The task stops on it (`AbortTaskRunError`) instead of spending its retries.
 */
export class UnconvertibleSourceError extends Error {
  override name = "UnconvertibleSourceError";
}

/* ------------------------------------------------------------------ store */

export type MarkdownKey = { cellId: string; url: string };
export type MarkdownResolution =
  | { record: ExternalApi; reused: boolean }
  | { error: string };
/**
 * Resolves many keys at once, in order. The `run-ai-cell` task backs it with
 * a batch of `convert-to-markdown` runs; the contract test with a Map;
 * `resolveMarkdownsInProcess` is for callers that bring a converter.
 */
export type MarkdownResolver = (
  keys: MarkdownKey[],
) => Promise<MarkdownResolution[]>;

/** The store surface: `resolve` for the task, the reads for `planConversions`. */
export type MarkdownStore = Pick<
  ExternalApiService,
  "resolve" | "find" | "findByInput" | "save"
>;

export type MarkdownRecordDeps = {
  store?: Pick<ExternalApiService, "resolve">;
  convert?: Converter;
  fetchImpl?: FetchLike;
  now?: () => Date;
};

/** A stored record is only a hit when it is markitdown's markdown. */
export function isDocumentMarkdown(
  output: ExternalApiOutput,
): output is DocumentMarkdownOutput {
  return documentMarkdownOutputSchema.safeParse(output).success;
}

/** A temp name markitdown can sniff by extension, free of whatever the URL held. */
function tempName(filename: string): string {
  const extension = extname(filename)
    .toLowerCase()
    .replace(/[^.\w]/g, "");
  return `source${extension.slice(0, 12)}`;
}

/** Fetches (or, for YouTube, hands over the URL) and converts — the `ExternalApi` row to store. */
async function produceMarkdown(
  url: string,
  deps: MarkdownRecordDeps,
): Promise<DocumentMarkdownOutput> {
  const convert = deps.convert ?? converterUnavailable;
  const convertedAt = (deps.now ?? (() => new Date()))().toISOString();

  if (isYoutubeUrl(url)) {
    const result = await convert({ url });
    if (!result.markdown.trim()) {
      throw new UnconvertibleSourceError("markitdown found nothing to read");
    }
    return {
      kind: EXTERNAL_API_KINDS.documentMarkdown,
      provider: "markitdown",
      version: result.version,
      source: "youtube",
      markdown: result.markdown,
      title: result.title,
      filename: result.title ?? filenameOf(url),
      mediaType: "text/html",
      bytes: null,
      characters: result.markdown.length,
      convertedAt,
    };
  }

  const file = await fetchFile(url, deps.fetchImpl ?? fetch, MAX_CONVERT_BYTES);
  if ("error" in file) {
    if (file.error.startsWith("larger than")) {
      throw new UnconvertibleSourceError(file.error);
    }
    throw new Error(file.error);
  }
  const dir = await mkdtemp(join(tmpdir(), "markitdown-"));
  let result: ConvertResult;
  try {
    const path = join(dir, tempName(file.filename));
    await writeFile(path, file.data);
    result = await convert({ path, filename: file.filename });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  // An image is attached whatever its markdown holds (often only EXIF, or
  // nothing), so empty is a result for it; for anything else empty means
  // markitdown could not read it — a scanned PDF — and the file is attached.
  if (!result.markdown.trim() && !isImageMediaType(file.mediaType)) {
    throw new UnconvertibleSourceError(
      "no text could be extracted from the file",
    );
  }
  return {
    kind: EXTERNAL_API_KINDS.documentMarkdown,
    provider: "markitdown",
    version: result.version,
    source: "file",
    markdown: result.markdown,
    title: result.title,
    filename: file.filename,
    mediaType: file.mediaType,
    bytes: file.data.byteLength,
    characters: result.markdown.length,
    convertedAt,
  };
}

/**
 * The stored markdown for this cell and URL — this cell's, or any cell's,
 * copied — or a fresh conversion. What the `convert-to-markdown` task runs;
 * throws when fetching or converting fails, which the task's retry and the
 * caller's fallback both need to see.
 */
export async function resolveMarkdownRecord(
  key: MarkdownKey,
  deps: MarkdownRecordDeps = {},
): Promise<{ record: ExternalApi; reused: boolean }> {
  const store = deps.store ?? externalApiService;
  return store.resolve(
    { cellId: key.cellId, input: key.url },
    () => produceMarkdown(key.url, deps),
    isDocumentMarkdown,
    { anyCell: true },
  );
}

/** One key after another; a throw becomes that key's failure. */
export const resolveMarkdownsInProcess =
  (deps: MarkdownRecordDeps): MarkdownResolver =>
  async (keys) => {
    const results: MarkdownResolution[] = [];
    for (const key of keys) {
      try {
        results.push(await resolveMarkdownRecord(key, deps));
      } catch (error) {
        results.push({ error: describeError(error).message });
      }
    }
    return results;
  };

/* ------------------------------------------------------------------- cell */

export type CellMarkdown = {
  columnId: string;
  /** `ExternalApi.input`: the URL the cell holds. */
  source: string;
  filename: string;
  mediaType: string;
  characters: number;
  /** The markdown as prompt text, within `MAX_MARKDOWN_PROMPT_CHARS`. */
  content: string;
  truncated: boolean;
  /** Whether a stored result answered it, rather than a fresh conversion. */
  reused: boolean;
};

export type CellMarkdownFailure = {
  columnId: string;
  url: string;
  error: string;
};

export type Conversions = {
  documents: CellMarkdown[];
  failures: CellMarkdownFailure[];
};

/** What a completed run records about its conversions — never the markdown. */
export type ConversionSummary =
  | {
      columnId: string;
      source: string;
      characters: number;
      truncated: boolean;
      reused: boolean;
    }
  | CellMarkdownFailure;

/** The markdown as prompt text: capped, and saying so when it was cut. */
export function formatMarkdown(markdown: string): {
  content: string;
  truncated: boolean;
} {
  if (markdown.length <= MAX_MARKDOWN_PROMPT_CHARS) {
    return { content: markdown, truncated: false };
  }
  const omitted = markdown.length - MAX_MARKDOWN_PROMPT_CHARS;
  return {
    content: `${markdown.slice(0, MAX_MARKDOWN_PROMPT_CHARS)}\n[… ${omitted} more characters omitted]`,
    truncated: true,
  };
}

function toCellMarkdown(
  cell: RunAiInputCell & { value: string },
  record: ExternalApi,
  reused: boolean,
): CellMarkdown | CellMarkdownFailure {
  const parsed = documentMarkdownOutputSchema.safeParse(record.output);
  if (!parsed.success) {
    return {
      columnId: cell.id,
      url: cell.value,
      error: "the stored result is not a markdown conversion",
    };
  }
  const { content, truncated } = formatMarkdown(parsed.data.markdown);
  return {
    columnId: cell.id,
    source: record.input,
    filename: parsed.data.filename,
    mediaType: parsed.data.mediaType,
    characters: parsed.data.characters,
    content,
    truncated,
    reused,
  };
}

/** One convertible cell of the row: its key, and the stored record when there is one. */
export type ConversionTarget = {
  cell: RunAiInputCell & { value: string };
  key: MarkdownKey;
  cached: { record: ExternalApi; reused: true } | null;
};

/**
 * The row's convertible cells, each looked up in the store first: this
 * cell's record, or another cell's copied under this key (`anyCell`, as
 * `resolve` would). The ones still `cached: null` are the misses a resolver
 * has to convert. `address` is the *running* cell's address — its sheet and
 * row are the source cells'. A store that cannot be read only costs the
 * shortcut: the key goes to the resolver.
 */
export async function planConversions(
  address: CellAddress,
  cells: RunAiInputCell[],
  store: Pick<
    MarkdownStore,
    "find" | "findByInput" | "save"
  > = externalApiService,
): Promise<ConversionTarget[]> {
  return Promise.all(
    cells.filter(isConvertibleCell).map(async (cell) => {
      const key = {
        cellId: cellId(address.sheetId, address.row, cell.index),
        url: cell.value,
      };
      try {
        const own = await store.find({ cellId: key.cellId, input: key.url });
        if (own && isDocumentMarkdown(own.output)) {
          return { cell, key, cached: { record: own, reused: true as const } };
        }
        const elsewhere = await store.findByInput(key.url);
        if (
          elsewhere &&
          elsewhere.cellId !== key.cellId &&
          isDocumentMarkdown(elsewhere.output)
        ) {
          const copy = await store.save({
            cellId: key.cellId,
            input: key.url,
            output: elsewhere.output,
          });
          return { cell, key, cached: { record: copy, reused: true as const } };
        }
      } catch {
        // Fall through: the resolver converts it.
      }
      return { cell, key, cached: null };
    }),
  );
}

/** The keys a resolver still has to convert, in row order. */
export const conversionMisses = (targets: ConversionTarget[]): MarkdownKey[] =>
  targets.filter((target) => target.cached === null).map(({ key }) => key);

/**
 * The plan joined with the resolver's answers for its misses (same order).
 * Never throws: a missing answer is that cell's failure.
 */
export function conversionsFrom(
  targets: ConversionTarget[],
  resolutions: MarkdownResolution[],
): Conversions {
  const documents: CellMarkdown[] = [];
  const failures: CellMarkdownFailure[] = [];
  let next = 0;
  for (const target of targets) {
    const resolution: MarkdownResolution = target.cached ??
      resolutions[next++] ?? {
        error: "the conversion resolver returned no result for this cell",
      };
    const result =
      "record" in resolution
        ? toCellMarkdown(target.cell, resolution.record, resolution.reused)
        : {
            columnId: target.cell.id,
            url: target.cell.value,
            error: resolution.error,
          };
    if ("content" in result) documents.push(result);
    else failures.push(result);
  }
  return { documents, failures };
}

/**
 * Every convertible cell of the row, store first, misses through `resolve`,
 * in row order — the two halves above in one call, for callers with nothing
 * else to wait on. Never throws: a resolver that fails as a whole fails
 * every miss.
 */
export async function collectConversions(
  address: CellAddress,
  cells: RunAiInputCell[],
  resolve: MarkdownResolver,
  store?: Pick<MarkdownStore, "find" | "findByInput" | "save">,
): Promise<Conversions> {
  const targets = await planConversions(address, cells, store);
  const misses = conversionMisses(targets);
  let resolutions: MarkdownResolution[];
  try {
    resolutions = misses.length === 0 ? [] : await resolve(misses);
  } catch (error) {
    const message = describeError(error).message;
    resolutions = misses.map(() => ({ error: message }));
  }
  return conversionsFrom(targets, resolutions);
}

export function summariseConversions(
  conversions: Conversions,
): ConversionSummary[] {
  return [
    ...conversions.documents.map(
      ({ columnId, source, characters, truncated, reused }) => ({
        columnId,
        source,
        characters,
        truncated,
        reused,
      }),
    ),
    ...conversions.failures,
  ];
}
