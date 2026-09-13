import { describeError } from "../common/errors";
import type {
  ExternalApi,
  ExternalApiOutput,
  WebsiteCrawlOutput,
} from "../modules/external-api/external-api.schema";
import { websiteCrawlOutputSchema } from "../modules/external-api/external-api.schema";
import type { ExternalApiService } from "../modules/external-api/external-api.service";
import { externalApiService } from "../modules/external-api/external-api.service";
import type { RunAiInputCell } from "../modules/run-ai/run-ai.schema";
import type { CellAddress } from "../modules/spreadsheet/spreadsheet.ids";
import { cellId } from "../modules/spreadsheet/spreadsheet.ids";
import { isUrlCell } from "./cell-attachments";
import { crawlWebsite } from "./firecrawl";

// A url cell reaches the model as the site's content, not as one fetched
// page: before a cell runs, every url cell of its row is resolved to a crawl
// — Firecrawl, subdomains included — cached in the generic `ExternalApi`
// table under the url cell's own scoped id plus the URL (the transcript
// keying), and reused from ANY cell that already holds a crawl of the same
// URL, so a website is paid for once per sheet rather than once per row.
//
// Two layers, because the crawl runs in its own Trigger.dev task
// (`src/trigger/crawl-website.ts`) while this file must stay SDK-free:
// `resolveCrawlRecord` is what the task runs (store → Firecrawl), and
// `collectCrawls` takes a `CrawlResolver` — the task hands it one backed by
// `batchTriggerAndWait`, the contract test hands it a Map, anything else can
// use the in-process one. Nothing here throws: a site that cannot be crawled
// becomes a note in the prompt, exactly like a recording that cannot be
// transcribed.

/** Column types whose value is a website to crawl rather than a file to attach. */
const CRAWLABLE_TYPES = new Set(["url"]);

export function isCrawlableCell(
  cell: RunAiInputCell,
): cell is RunAiInputCell & { value: string } {
  return isUrlCell(cell, CRAWLABLE_TYPES);
}

/** The prompt's budget for one url cell's content, and for one page of it. */
export const MAX_CRAWL_PROMPT_CHARS = 60_000;
export const MAX_PAGE_PROMPT_CHARS = 8_000;
/** Below this much room a page fragment would be noise, so the list stops. */
const MIN_PAGE_ROOM = 1_000;

export type CellCrawl = {
  columnId: string;
  /** `ExternalApi.input`: the URL the cell holds. */
  source: string;
  pages: number;
  characters: number;
  /** The pages as prompt text, within the budgets — `formatCrawledPages`. */
  content: string;
  /** Whether a stored result answered it, rather than a fresh crawl. */
  reused: boolean;
};

export type CellCrawlFailure = {
  columnId: string;
  url: string;
  error: string;
};

export type Crawls = {
  sites: CellCrawl[];
  failures: CellCrawlFailure[];
};

/** What a completed run records about its crawls — never the content. */
export type CrawlSummary =
  | {
      columnId: string;
      source: string;
      pages: number;
      characters: number;
      reused: boolean;
    }
  | CellCrawlFailure;

/** One url cell to resolve: the store key. */
export type CrawlKey = { cellId: string; url: string };
export type CrawlResolution =
  | { record: ExternalApi; reused: boolean }
  | { error: string };
/**
 * Resolves many keys at once, in order. The `run-ai-cell` task backs it with
 * `batchTriggerAndWait` of `crawl-website`; the contract test with a Map;
 * `resolveCrawlsInProcess` is for callers outside a task.
 */
export type CrawlResolver = (keys: CrawlKey[]) => Promise<CrawlResolution[]>;

/** The store surface used here: one call, so a fake is one method. */
export type CrawlStore = Pick<ExternalApiService, "resolve">;

export type CrawlRecordDeps = {
  store?: CrawlStore;
  crawl?: (url: string) => Promise<WebsiteCrawlOutput>;
};

/** A stored record is only a hit when it is a website crawl. */
export function isWebsiteCrawl(
  output: ExternalApiOutput,
): output is WebsiteCrawlOutput {
  return websiteCrawlOutputSchema.safeParse(output).success;
}

/**
 * The stored crawl for this cell and URL — this cell's, or any cell's,
 * copied — or a fresh one. What the `crawl-website` task runs; throws when
 * Firecrawl fails, which the task's retry and the caller's failure note
 * both need to see.
 */
export async function resolveCrawlRecord(
  key: CrawlKey,
  deps: CrawlRecordDeps = {},
): Promise<{ record: ExternalApi; reused: boolean }> {
  const store = deps.store ?? externalApiService;
  const crawl = deps.crawl ?? crawlWebsite;
  return store.resolve(
    { cellId: key.cellId, input: key.url },
    () => crawl(key.url),
    isWebsiteCrawl,
    { anyCell: true },
  );
}

/** One key after another (Firecrawl allows little concurrency); a throw becomes that key's failure. */
export const resolveCrawlsInProcess: CrawlResolver = async (keys) => {
  const results: CrawlResolution[] = [];
  for (const key of keys) {
    try {
      results.push(await resolveCrawlRecord(key));
    } catch (error) {
      results.push({ error: describeError(error).message });
    }
  }
  return results;
};

/**
 * The pages as prompt text: crawl order, each under `MAX_PAGE_PROMPT_CHARS`,
 * until the cell's `MAX_CRAWL_PROMPT_CHARS` is spent; what did not fit is
 * counted rather than silently dropped, so the model knows the site goes on.
 */
export function formatCrawledPages(output: WebsiteCrawlOutput): string {
  const blocks: string[] = [];
  let spent = 0;
  let included = 0;
  for (const page of output.pages) {
    const heading = `### ${page.url}${page.title ? ` — ${page.title}` : ""}`;
    const room = MAX_CRAWL_PROMPT_CHARS - spent - heading.length - 1;
    if (room < MIN_PAGE_ROOM) break;
    const cap = Math.min(room, MAX_PAGE_PROMPT_CHARS);
    const body =
      page.markdown.length > cap
        ? `${page.markdown.slice(0, cap)}\n[…]`
        : page.markdown;
    blocks.push(`${heading}\n${body}`);
    spent += heading.length + 1 + body.length;
    included += 1;
  }
  const omitted = output.pages.length - included;
  if (omitted > 0) {
    blocks.push(`(${omitted} more page${omitted === 1 ? "" : "s"} omitted)`);
  }
  return blocks.join("\n\n");
}

function toCellCrawl(
  cell: RunAiInputCell & { value: string },
  record: ExternalApi,
  reused: boolean,
): CellCrawl | CellCrawlFailure {
  const parsed = websiteCrawlOutputSchema.safeParse(record.output);
  if (!parsed.success) {
    return {
      columnId: cell.id,
      url: cell.value,
      error: "the stored result is not a website crawl",
    };
  }
  return {
    columnId: cell.id,
    source: record.input,
    pages: parsed.data.pages.length,
    characters: parsed.data.pages.reduce(
      (sum, page) => sum + page.characters,
      0,
    ),
    content: formatCrawledPages(parsed.data),
    reused,
  };
}

/**
 * Every url cell of the row, resolved together, in row order. `address` is
 * the *running* cell's address — its sheet and row are the url cells' — so
 * each crawl is keyed by the url cell it belongs to. Never throws: a
 * resolver that fails as a whole fails every key.
 */
export async function collectCrawls(
  address: CellAddress,
  cells: RunAiInputCell[],
  resolve: CrawlResolver = resolveCrawlsInProcess,
): Promise<Crawls> {
  const targets = cells.filter(isCrawlableCell);
  const keys = targets.map((cell) => ({
    cellId: cellId(address.sheetId, address.row, cell.index),
    url: cell.value,
  }));
  let resolutions: CrawlResolution[];
  try {
    resolutions = keys.length === 0 ? [] : await resolve(keys);
  } catch (error) {
    const message = describeError(error).message;
    resolutions = keys.map(() => ({ error: message }));
  }
  const sites: CellCrawl[] = [];
  const failures: CellCrawlFailure[] = [];
  targets.forEach((cell, position) => {
    const resolution = resolutions[position] ?? {
      error: "the crawl resolver returned no result for this cell",
    };
    const result =
      "record" in resolution
        ? toCellCrawl(cell, resolution.record, resolution.reused)
        : { columnId: cell.id, url: cell.value, error: resolution.error };
    if ("content" in result) sites.push(result);
    else failures.push(result);
  });
  return { sites, failures };
}

export function summariseCrawls(crawls: Crawls): CrawlSummary[] {
  return [
    ...crawls.sites.map(({ columnId, source, pages, characters, reused }) => ({
      columnId,
      source,
      pages,
      characters,
      reused,
    })),
    ...crawls.failures,
  ];
}
