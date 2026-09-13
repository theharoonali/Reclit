import type {
  CrawledPage,
  WebsiteCrawlOutput,
} from "../modules/external-api/external-api.schema";
import { EXTERNAL_API_KINDS } from "../modules/external-api/external-api.schema";

// The Firecrawl crawl, and nothing else. Plain `fetch` rather than the vendor
// SDK (same reasoning as elevenlabs.ts): the flow is one POST to start a
// crawl and GETs until it is done, and keeping it dependency-free means the
// page cap, the timeouts, the polling cadence and the response parsing are
// ours. The key is read per call, never at import time (the gemini.ts idiom),
// so the API and the test suite boot without it.
//
// A crawl is asynchronous on Firecrawl's side, so `crawlWebsite` loops:
// start → sleep → read the status → … → follow the `next` pages. The sleep
// is injected: the `crawl-website` task passes Trigger.dev's `wait.for` (a
// checkpointed, free wait), in-process callers get a plain timer, and the
// contract test passes a counter. Nothing here imports the Trigger SDK.

export const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2";
export const FIRECRAWL_PROVIDER = "firecrawl";
/** Pages per crawl — one Firecrawl credit each, and each one lands in the prompt. */
export const FIRECRAWL_MAX_PAGES = 25;
export const FIRECRAWL_MAX_DEPTH = 2;
/** One HTTP call. */
export const FIRECRAWL_REQUEST_TIMEOUT_MS = 30_000;
/** Between status reads; at least 5 s so the task's `wait.for` is checkpointed and free. */
export const FIRECRAWL_POLL_SECONDS = 10;
/** Wall clock for one whole crawl before it is cancelled and given up on. */
export const FIRECRAWL_CRAWL_DEADLINE_MS = 10 * 60_000;
/** Stored markdown per page; a longer page is cut, not dropped. */
export const FIRECRAWL_MAX_PAGE_CHARS = 100_000;

/**
 * What every crawl asks for. `crawlEntireDomain` + `allowSubdomains`: the
 * whole site, not just the start URL's subtree; main content only, as
 * markdown, which is what a model reads best.
 */
export const CRAWL_OPTIONS = {
  limit: FIRECRAWL_MAX_PAGES,
  maxDiscoveryDepth: FIRECRAWL_MAX_DEPTH,
  crawlEntireDomain: true,
  allowSubdomains: true,
  sitemap: "include",
  ignoreQueryParameters: true,
  scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
} as const;

/** Minimal fetch surface, so the contract test can drive this without a key. */
export type CrawlFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export type CrawlDeps = {
  fetchImpl?: CrawlFetch;
  /** Waits between status reads. The task injects `wait.for`; the default is a timer. */
  sleep?: (seconds: number) => Promise<void>;
  now?: () => number;
};

/** One status read, defensively parsed; `pages` is this read's slice of the results. */
export type CrawlStatusPage = {
  status: string;
  total: number;
  completed: number;
  creditsUsed: number | null;
  next: string | null;
  pages: CrawledPage[];
};

/** Carries the HTTP status so a 429 is recognisable to the task's retry. */
export class FirecrawlError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "FirecrawlError";
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    throw new Error(
      "FIRECRAWL_API_KEY is not set. Add it to apps/api/.env (see .env.example).",
    );
  }
  return key;
}

const defaultFetch = fetch as unknown as CrawlFetch;
const defaultSleep = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;
const asInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;

/** One authenticated call; `path` is relative to the API, or a full `next` URL. */
async function call(
  path: string,
  init: { method: string; body?: unknown },
  fetchImpl: CrawlFetch,
): Promise<unknown> {
  const url = path.startsWith("http") ? path : `${FIRECRAWL_API_URL}${path}`;
  const response = await fetchImpl(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(FIRECRAWL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new FirecrawlError(
      response.status,
      `Firecrawl ${init.method} ${path} failed: HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
    );
  }
  return response.json();
}

/** A page as Firecrawl returns it, or null when it holds nothing a model could read. */
function toPage(raw: unknown): CrawledPage | null {
  const page = asRecord(raw);
  if (!page) return null;
  const metadata = asRecord(page.metadata) ?? {};
  // `url` is where the page ended up after redirects; `sourceURL` what was asked for.
  const url = asText(metadata.url) ?? asText(metadata.sourceURL);
  const markdown =
    typeof page.markdown === "string"
      ? page.markdown.slice(0, FIRECRAWL_MAX_PAGE_CHARS)
      : "";
  if (!url || markdown.trim() === "") return null;
  const title = Array.isArray(metadata.title)
    ? asText(metadata.title[0])
    : asText(metadata.title);
  return {
    url,
    title,
    statusCode: asInt(metadata.statusCode),
    characters: markdown.length,
    markdown,
  };
}

/** Starts a crawl of `url` with `CRAWL_OPTIONS`; returns Firecrawl's crawl id. */
export async function startCrawl(
  url: string,
  fetchImpl: CrawlFetch = defaultFetch,
): Promise<{ id: string }> {
  const body = asRecord(
    await call(
      "/crawl",
      { method: "POST", body: { url, ...CRAWL_OPTIONS } },
      fetchImpl,
    ),
  );
  const id = asText(body?.id);
  if (!id) throw new Error("Firecrawl accepted the crawl but returned no id");
  return { id };
}

/** `idOrNextUrl`: a crawl id, or the full `next` URL of a previous read. */
export async function readCrawlStatus(
  idOrNextUrl: string,
  fetchImpl: CrawlFetch = defaultFetch,
): Promise<CrawlStatusPage> {
  const path = idOrNextUrl.startsWith("http")
    ? idOrNextUrl
    : `/crawl/${encodeURIComponent(idOrNextUrl)}`;
  const body = asRecord(await call(path, { method: "GET" }, fetchImpl)) ?? {};
  const data = Array.isArray(body.data) ? body.data : [];
  return {
    status: asText(body.status) ?? "unknown",
    total: asInt(body.total) ?? 0,
    completed: asInt(body.completed) ?? 0,
    creditsUsed: asInt(body.creditsUsed),
    next: asText(body.next),
    pages: data
      .map(toPage)
      .filter((page): page is CrawledPage => page !== null),
  };
}

/** Best effort: a crawl past its deadline is stopped so it stops costing credits. */
export async function cancelCrawl(
  id: string,
  fetchImpl: CrawlFetch = defaultFetch,
): Promise<void> {
  await call(
    `/crawl/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    fetchImpl,
  )
    .then(() => undefined)
    .catch(() => undefined);
}

const isTerminal = (status: string) =>
  status === "completed" || status === "failed" || status === "cancelled";

/**
 * One website, end to end: start, wait until Firecrawl is done, read every
 * page. Throws — the caller decides what a failure means — on a crawl that
 * ends any way but `completed`, on the deadline (after cancelling), and on a
 * crawl with no readable page, so an empty result is never stored as if it
 * were the site.
 */
export async function crawlWebsite(
  url: string,
  deps: CrawlDeps = {},
): Promise<WebsiteCrawlOutput> {
  const fetchImpl = deps.fetchImpl ?? defaultFetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const started = now();
  const { id } = await startCrawl(url, fetchImpl);

  let status = await readCrawlStatus(id, fetchImpl);
  while (!isTerminal(status.status)) {
    if (now() - started > FIRECRAWL_CRAWL_DEADLINE_MS) {
      await cancelCrawl(id, fetchImpl);
      throw new Error(
        `Firecrawl crawl ${id} of ${url} did not finish within ${FIRECRAWL_CRAWL_DEADLINE_MS / 1000} s`,
      );
    }
    await sleep(FIRECRAWL_POLL_SECONDS);
    status = await readCrawlStatus(id, fetchImpl);
  }
  if (status.status !== "completed") {
    throw new Error(
      `Firecrawl crawl ${id} of ${url} ended as "${status.status}"`,
    );
  }

  // A completed read carries the first ≤ 10 MB of pages; `next` has the rest.
  const pages = new Map<string, CrawledPage>();
  let slice: CrawlStatusPage | null = status;
  while (slice) {
    for (const page of slice.pages) {
      if (!pages.has(page.url)) pages.set(page.url, page);
    }
    slice = slice.next ? await readCrawlStatus(slice.next, fetchImpl) : null;
  }
  if (pages.size === 0) {
    throw new Error(`Firecrawl crawl ${id} of ${url} returned no pages`);
  }

  return {
    kind: EXTERNAL_API_KINDS.websiteCrawl,
    provider: FIRECRAWL_PROVIDER,
    crawlId: id,
    url,
    options: {
      limit: CRAWL_OPTIONS.limit,
      maxDiscoveryDepth: CRAWL_OPTIONS.maxDiscoveryDepth,
      allowSubdomains: CRAWL_OPTIONS.allowSubdomains,
      crawlEntireDomain: CRAWL_OPTIONS.crawlEntireDomain,
    },
    pages: [...pages.values()],
    total: status.total,
    completed: status.completed,
    creditsUsed: status.creditsUsed,
    crawledAt: new Date(now()).toISOString(),
  };
}
