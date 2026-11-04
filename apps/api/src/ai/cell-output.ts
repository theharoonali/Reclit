import type { LanguageModelUsage, ModelMessage } from "ai";
import { generateText, Output } from "ai";
import { describeError } from "../common/errors";
import type { RunAiInput } from "../modules/run-ai/run-ai.schema";
import type { CellAddress } from "../modules/spreadsheet/spreadsheet.ids";
import type {
  CellValue,
  ColumnTypeWire,
} from "../modules/spreadsheet/spreadsheet.schema";
import {
  cellValueMatchesType,
  cellValueSchema,
  isPlainObject,
} from "../modules/spreadsheet/spreadsheet.schema";
import type {
  AttachmentSummary,
  Attachments,
  FetchLike,
} from "./cell-attachments";
import { fetchAttachments, summariseAttachments } from "./cell-attachments";
import type {
  CrawlKey,
  CrawlResolution,
  CrawlSummary,
  Crawls,
} from "./cell-crawls";
import {
  collectCrawls,
  crawlKeys,
  resolveCrawlsInProcess,
  summariseCrawls,
} from "./cell-crawls";
import type {
  ConversionSummary,
  Conversions,
  MarkdownKey,
  MarkdownResolution,
  MarkdownStore,
} from "./cell-markdown";
import {
  conversionMisses,
  conversionsFrom,
  isImageMediaType,
  isYoutubeUrl,
  planConversions,
  resolveMarkdownsInProcess,
  summariseConversions,
} from "./cell-markdown";
import type { CellMessages, CellSourceNote } from "./cell-prompt";
import { buildCellMessages, cellOutputSchema } from "./cell-prompt";
import type { CompanyContext } from "./company-context";
import { aiModel, cachedContentOptions } from "./model";

// The one model call behind an AI cell, and the typed-output call every
// generator ends on. Before the prompt is built, the row's file, audio and
// YouTube cells are resolved to markdown (markitdown) and its other url cells
// to crawled websites — both cached in `ExternalApi`, both read as text, both
// produced by child tasks in ONE batch wait (Trigger.dev refuses two waits at
// once). Only images, and files whose conversion failed, are then fetched and
// attached as file parts. The answer is structured
// output typed by the column (`Output.object`), free JSON for a `json`
// column (`Output.json`), and passes the same `cellValueMatchesType` check
// the spreadsheet applies on write, so a run never completes with a value
// its cell would refuse.

/** A cell's token counts; `cachedInputTokens` is the part of the input a prompt cache served. */
export type CellUsage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  cachedInputTokens: number | undefined;
};

export const cellUsage = (usage: LanguageModelUsage): CellUsage => ({
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  totalTokens: usage.totalTokens,
  cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens,
});

/**
 * What one cell's model call is sent, apart from the model and the output:
 * `system` on the implicit path; on the explicit-cache path no `system`
 * (the model answers 400 "CachedContent can not be used with GenerateContent
 * request setting system_instruction, tools or tool_config") and the cache
 * named in the provider options (`cachedContentOptions`, ai/model.ts).
 */
export type CellCall = {
  system?: string;
  messages: ModelMessage[];
  providerOptions?: ReturnType<typeof cachedContentOptions>;
};

/** What the company context and the batch's explicit cache add to a cell's call. */
export type CellCacheOptions = {
  company?: CompanyContext | null;
  /** A `cachedContents/…` name from `ensureCompanyCache`; omitted = the implicit path. */
  cacheName?: string | null;
};

export type CellFile = {
  data: Uint8Array;
  mediaType: string;
  filename: string;
};

/** The user turn: the text, then every fetched file. */
function userMessage(text: string, files: CellFile[]): ModelMessage {
  return {
    role: "user",
    content: [
      { type: "text", text },
      ...files.map((file) => ({
        type: "file" as const,
        data: file.data,
        mediaType: file.mediaType,
        filename: file.filename,
      })),
    ],
  };
}

/**
 * Pure: both calls one cell could make — always the implicit one, and the
 * cached one when the batch has a cache. The contract test asserts these
 * shapes without a key.
 */
export function cellCalls(
  messages: CellMessages,
  files: CellFile[],
  cacheName?: string | null,
): { implicit: CellCall; cached: CellCall | null } {
  return {
    implicit: {
      system: messages.system,
      messages: [userMessage(messages.prompt, files)],
    },
    cached: cacheName
      ? {
          messages: [userMessage(messages.cachedPrompt, files)],
          providerOptions: cachedContentOptions(cacheName),
        }
      : null,
  };
}

/**
 * Runs the cached call when there is one, and the implicit call when there
 * is not — or when the cached one fails for any reason (expired, deleted,
 * refused). A cache can make a cell cheaper; it can never fail one.
 */
export async function withCacheFallback<T>(
  calls: { implicit: CellCall; cached: CellCall | null },
  run: (call: CellCall) => Promise<T>,
): Promise<T> {
  if (calls.cached) {
    try {
      return await run(calls.cached);
    } catch (error) {
      console.warn(
        "[prompt-cache] cached call failed, retrying without the cache:",
        describeError(error).message,
      );
    }
  }
  return run(calls.implicit);
}

export type CellGeneration = {
  output: Exclude<CellValue, null>;
  model: string;
  usage: CellUsage;
  /** What travelled with the prompt, and what could not — never the bytes. */
  attachments: AttachmentSummary[];
  /** What was converted to markdown, reused or not, and what could not — never the markdown. */
  conversions: ConversionSummary[];
  /** What was crawled, reused or not, and what could not — never the pages. */
  crawls: CrawlSummary[];
};

/** What a running cell still needs produced: the row's crawls, and its conversions the store did not hold. */
export type SourceRequest = { crawls: CrawlKey[]; conversions: MarkdownKey[] };
export type SourceResolutions = {
  crawls: CrawlResolution[];
  conversions: MarkdownResolution[];
};
/**
 * Resolves a whole request at once, each list in order. The `run-ai-cell`
 * task backs it with one `batch.triggerByTaskAndWait` over `crawl-website`
 * and `convert-to-markdown`; the contract test with Maps.
 */
export type SourceResolver = (
  request: SourceRequest,
) => Promise<SourceResolutions>;

/**
 * Outside a task: crawls in process, and no converter — a conversion fails
 * and its file is attached instead, as before markitdown.
 */
export const resolveSourcesInProcess: SourceResolver = async (request) => ({
  crawls: await resolveCrawlsInProcess(request.crawls),
  conversions: await resolveMarkdownsInProcess({})(request.conversions),
});

/**
 * How the row's sources are resolved. Every entry is optional: the defaults
 * are the real store, in-process crawls and real fetches; the `run-ai-cell`
 * task hands in a resolver backed by child tasks, and the contract test
 * hands in fakes.
 */
export type CellSourceDeps = {
  sources?: SourceResolver;
  store?: Pick<MarkdownStore, "find" | "findByInput" | "save">;
  fetchImpl?: FetchLike;
};

type RowCell = RunAiInput["row"]["cells"][number];

/**
 * The row's crawls and conversions through one resolver call — skipped when
 * the store already answered everything. Never throws: a resolver that
 * fails as a whole fails every key it was asked for.
 */
export async function resolveRowSources(
  address: CellAddress,
  cells: RowCell[],
  deps: CellSourceDeps = {},
): Promise<{ crawls: Crawls; conversions: Conversions }> {
  const targets = await planConversions(address, cells, deps.store);
  const request: SourceRequest = {
    crawls: crawlKeys(address, cells),
    conversions: conversionMisses(targets),
  };
  let resolved: SourceResolutions = { crawls: [], conversions: [] };
  if (request.crawls.length > 0 || request.conversions.length > 0) {
    try {
      resolved = await (deps.sources ?? resolveSourcesInProcess)(request);
    } catch (error) {
      const failed = { error: describeError(error).message };
      resolved = {
        crawls: request.crawls.map(() => failed),
        conversions: request.conversions.map(() => failed),
      };
    }
  }
  return {
    // Already resolved above; collectCrawls only maps them back to cells.
    crawls: await collectCrawls(address, cells, async () => resolved.crawls),
    conversions: conversionsFrom(targets, resolved.conversions),
  };
}

/**
 * The cells whose file the model is also given: an image (its markdown is
 * only metadata, the model reads the picture) and any file whose conversion
 * failed. A YouTube page is never attached — it is not a file.
 */
export function cellsToAttach(
  cells: RowCell[],
  conversions: Conversions,
): (RowCell & { value: string })[] {
  const picked = new Set([
    ...conversions.documents
      .filter((doc) => isImageMediaType(doc.mediaType))
      .map((doc) => doc.columnId),
    ...conversions.failures
      .filter((failure) => !isYoutubeUrl(failure.url))
      .map((failure) => failure.columnId),
  ]);
  return cells.filter(
    (cell): cell is RowCell & { value: string } =>
      typeof cell.value === "string" && picked.has(cell.id),
  );
}

/**
 * The model's raw answer as a value the target cell would accept, or a throw
 * naming what it said instead. Shared by every generator (`generateCellValue`,
 * `generateSearchCellValue`): the check is the same `cellValueMatchesType` the
 * spreadsheet applies on any write, so a run can never complete with a value
 * its own cell would refuse.
 */
export function coerceCellValue(
  raw: unknown,
  type: ColumnTypeWire,
): Exclude<CellValue, null> {
  const parsed = cellValueSchema.safeParse(raw);
  if (!parsed.success || parsed.data === null) {
    throw new Error(
      `The model answered with something that is not a cell value: ${JSON.stringify(raw)}`,
    );
  }
  const output = parsed.data;
  const fits =
    type === "json"
      ? isPlainObject(output)
      : cellValueMatchesType(output, type);
  if (!fits) {
    throw new Error(
      `The model answered with ${JSON.stringify(output)}, which is not a ${type}`,
    );
  }
  return output;
}

/**
 * One note per source cell. A converted file reads as its markdown (and says
 * so when the file travels too); a failed conversion reads as the attached
 * file when the fallback fetch worked, and as the conversion's failure when
 * it did not.
 */
export function notesOf(
  attachments: Attachments,
  conversions: Conversions,
  crawls: Crawls,
) {
  const notes = new Map<string, CellSourceNote>();
  const attached = new Map(
    attachments.files.map((file) => [file.columnId, file.filename]),
  );
  for (const failure of conversions.failures) {
    const filename = attached.get(failure.columnId);
    notes.set(
      failure.columnId,
      filename
        ? { kind: "attached", filename }
        : { kind: "failed", step: "convert", error: failure.error },
    );
  }
  for (const doc of conversions.documents) {
    const isAttached = attached.has(doc.columnId);
    notes.set(
      doc.columnId,
      // An image with no metadata has nothing to read; the file is the content.
      !doc.content.trim() && isAttached
        ? { kind: "attached", filename: doc.filename }
        : {
            kind: "converted",
            filename: doc.filename,
            content: doc.content,
            attached: isAttached,
          },
    );
  }
  for (const site of crawls.sites) {
    notes.set(site.columnId, {
      kind: "crawled",
      pages: site.pages,
      content: site.content,
    });
  }
  for (const failure of crawls.failures) {
    notes.set(failure.columnId, {
      kind: "failed",
      step: "crawl",
      error: failure.error,
    });
  }
  return notes;
}

/**
 * One model call whose answer is shaped to a column type: `Output.object`
 * with `cellOutputSchema` for a typed column, `Output.json` for a `json`
 * column (the model rejects open objects), then `coerceCellValue`. Every
 * generator ends on it. Never give this call `tools`: the model refuses a JSON
 * response schema alongside a tool in one request (400 INVALID_ARGUMENT —
 * docs/plans/021-google-search-node.md), which is why a search cell grounds
 * in one call and types its answer in this one. `call` is either shape of
 * `CellCall` — with a `system`, or on an explicit cache without one.
 */
export async function generateTypedCellValue({
  call,
  type,
}: {
  call: CellCall;
  type: ColumnTypeWire;
}): Promise<Pick<CellGeneration, "output" | "model" | "usage">> {
  const schema = cellOutputSchema(type);
  const model = aiModel();
  const result =
    schema === null
      ? await generateText({ model, ...call, output: Output.json() })
      : await generateText({
          model,
          ...call,
          output: Output.object({ schema }),
        });
  const raw =
    schema === null
      ? result.output
      : (result.output as { value: unknown }).value;
  return {
    output: coerceCellValue(raw, type),
    model: result.response.modelId,
    usage: cellUsage(result.usage),
  };
}

/**
 * `address` is the running cell's scoped address: its sheet and row are the
 * key the row's conversions and crawls are cached under (cell-markdown.ts,
 * cell-crawls.ts). `options` carries the company block and, in a batch, the
 * explicit cache (`cellCalls`, `withCacheFallback`).
 */
export async function generateCellValue(
  input: RunAiInput,
  address: CellAddress,
  deps: CellSourceDeps = {},
  options: CellCacheOptions = {},
): Promise<CellGeneration> {
  const { crawls, conversions } = await resolveRowSources(
    address,
    input.row.cells,
    deps,
  );
  const attachments = await fetchAttachments(
    cellsToAttach(input.row.cells, conversions),
    deps.fetchImpl,
  );
  const messages = buildCellMessages(
    input,
    notesOf(attachments, conversions, crawls),
    options.company,
  );
  const typed = await withCacheFallback(
    cellCalls(messages, attachments.files, options.cacheName),
    (call) => generateTypedCellValue({ call, type: input.target.type }),
  );
  return {
    ...typed,
    attachments: summariseAttachments(attachments),
    conversions: summariseConversions(conversions),
    crawls: summariseCrawls(crawls),
  };
}
