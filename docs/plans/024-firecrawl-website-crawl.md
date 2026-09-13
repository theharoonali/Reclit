# 024 — URL cells crawled with Firecrawl, cached, in a general task

**Status:** implemented
**Scope:** backend

## Goal

Before an AI cell runs, every **url** cell of its row is crawled with
Firecrawl (subdomains included) and the row reaches the model with the
site's content instead of one fetched page. The requested URL and the
crawled pages (URL, title, markdown) are saved in the generic `ExternalApi`
store; a later run of the same website — in the same cell or any other —
reads the store and never calls Firecrawl again. The crawl itself is a
general Trigger.dev task, `crawl-website`, that anything else can trigger.

## Backend (Agent 1)

- **Tables:** `ExternalApi` gains index `[input, createdAt]` (migration
  `external_api_input_index`) for the cross-cell lookup. No new table: the
  crawl is one more `output.kind`, `"website-crawl"`.
- **Procedures:** none new. `ExternalApiService` gains `findByInput(input)`
  and `resolve(key, produce, accept, { anyCell })` — on a miss for this
  cell, an accepted result for the same source in any cell is copied under
  this cell's key and counts as `reused`.
- **Service methods / helpers:**
  - `src/ai/firecrawl.ts` — `startCrawl`, `readCrawlStatus`, `cancelCrawl`,
    `crawlWebsite(url, { fetchImpl, sleep, now })`: start → sleep → status
    until terminal (10 min deadline, then cancel) → follow `next` → pages
    deduped by URL, markdown capped per page. Plain `fetch`, key read per
    call (`FIRECRAWL_API_KEY`), injectable sleep so the task can pass
    `wait.for`.
  - `src/ai/cell-crawls.ts` — the processor: `isCrawlableCell`,
    `resolveCrawlRecord` (store → Firecrawl), `collectCrawls(address, cells,
    resolver)` (never throws), `summariseCrawls`, `formatCrawledPages`
    (prompt budget 60,000 chars per url cell, 8,000 per page), and the
    `CrawlResolver` seam the task fills with `batchTriggerAndWait`.
  - `src/trigger/crawl-website.ts` — the general task: `{ cellId, url }` →
    `{ recordId, reused, pages, characters }`; `queue.concurrencyLimit: 1`
    (Free plan: 2 crawl starts a minute), retry with backoff for 429s.
  - `src/trigger/run-ai-cell.ts` — builds the task-backed resolver and
    passes it to `generateCellValue`; `result.crawls` records what was
    crawled, reused or not, and what could not — never the content.
  - `cell-prompt.ts` — `CellSourceNote` gains `crawled` and the `crawl`
    failure step; the row line says the site was crawled and a "Content of
    the website …" block follows the row.
  - `cell-attachments.ts` — `url` leaves `ATTACHABLE_TYPES`; only `file`
    cells are attached now.
- **Reused, not written:** `externalApiService.resolve`, `isUrlCell`,
  `cellId`/`parseCellId`, `describeError`, the transcript processor's shape
  (predicate / produce / collect / summarise), `generateTypedCellValue`.

## Frontend (Agent 2)

Nothing. The sheet still shows the url chip; the run's `result.crawls` is
visible through `runAi.byId` and the stored pages through
`externalApi.listByCell`.

## Integration (Agent 3)

Nothing to wire.

## Decisions

- **Crawl replaces the attachment for `url` cells**, as transcription
  replaced it for `audio`: sending Gemini raw HTML and crawled markdown
  would pay twice.
- **A separate task, not inline in `run-ai-cell`.** Reverses 021's "no task
  of its own" for this processor: the user wants a general reusable crawl,
  the crawl waits minutes (free only inside a task's `wait.for`), and
  Firecrawl's rate limit needs one queue.
- **Cache per url cell, reuse across cells by copying the hit.** Keeps the
  cascade ("clear the cell, drop its results") while honouring "the same
  website again"; `anyCell` is opt-in so transcripts keep today's behaviour.
- **Store the full markdown, budget the prompt.** The store is the source of
  truth; two constants keep a 25-page crawl to roughly 15k tokens per cell.
- **Raw REST, no `firecrawl` package** — two endpoints; the house idiom keeps
  timeout, parsing and caps ours and the worker bundle small.
- **25 pages, depth 2, whole domain with subdomains** — one credit per
  page; the free 1,000 credits a month is ~40 new sites.
- **`concurrencyLimit: 1` + retry backoff** for the Free plan; one constant
  to raise on a paid plan.
- **A failed crawl is a prompt note**, the cell still runs (user decision);
  a failed or empty crawl is not stored, so the next run tries again.
- **No TTL.** A stored crawl is reused until its cell is cleared or the
  row/column/sheet is deleted. A re-crawl means clearing the url cell.

## Risks / open questions

- One crawl at a time on Free: a Run over 20 url rows takes ~20 minutes of
  `running` cells.
- A retry after a started-but-unfinished crawl starts a second one (the old
  one expires on Firecrawl's side); bounded by `maxAttempts`.
- A cell cleared mid-crawl makes `save` hit the foreign key —
  `ExternalApiCellNotFoundError` becomes a failure note.
- A row with several url cells multiplies the prompt budget.

---

## Outcome

- **Shipped:**
  - `apps/api/prisma/schema.prisma` — `ExternalApi` index `[input, createdAt]`;
    migration `20260912195356_external_api_input_index` (hand-written, applied
    with `prisma migrate deploy`).
  - `apps/api/src/modules/external-api/external-api.schema.ts` —
    `EXTERNAL_API_KINDS.websiteCrawl`, `crawledPageSchema`,
    `websiteCrawlOutputSchema`, `crawlWebsiteJobSchema`;
    `external-api.service.ts` — `findByInput`, `resolve(…, { anyCell })`
    copying a cross-cell hit under the caller's key.
  - `apps/api/src/ai/firecrawl.ts` (new) — the client: `startCrawl`,
    `readCrawlStatus`, `cancelCrawl`, `crawlWebsite` with injected
    `fetchImpl` / `sleep` / `now`, `FirecrawlError` carrying the HTTP status.
  - `apps/api/src/ai/cell-crawls.ts` (new) — `isCrawlableCell`,
    `resolveCrawlRecord`, `resolveCrawlsInProcess`, `collectCrawls`,
    `summariseCrawls`, `formatCrawledPages` (60,000 / 8,000 character budgets).
  - `apps/api/src/trigger/crawl-website.ts` (new) — the general task,
    `queue.concurrencyLimit: 1`, four attempts with backoff, `wait.for`
    injected as the poll sleep; `run-ai-cell.ts` builds the
    `batchTriggerAndWait`-backed resolver and passes it to `generateCellValue`.
  - `cell-attachments.ts` (`url` no longer attachable), `cell-prompt.ts`
    (`crawled` note, `crawl` failure step, content blocks after the row),
    `cell-output.ts` (`CellSourceDeps`, `result.crawls`), `search-output.ts`
    (`crawls: []`).
  - Contract tests: `run-ai.api.test.ts` (header, classification, prompt
    line, "Firecrawl crawl client (pure)", "run-ai-cell task crawls (pure)"),
    `external-api.api.test.ts` (header, `anyCell` copy and per-cell default).
  - `apps/api/.env.example` (`FIRECRAWL_API_KEY`), `turbo.json` pass-through
    (`ELEVENLABS_API_KEY`, `FIRECRAWL_API_KEY`), `ARCHITECTURE.md` (diagram,
    jobs, env table incl. the previously missing ElevenLabs row),
    `docs/features/external-api.md`, `docs/features/run-ai.md`.
- **Deviated:** nothing material. The attachment test that fed a `url` cell
  through `collectAttachments` now asserts the cell is skipped there.
- **Not done:** the live end-to-end check (a real crawl through the worker
  and a sheet) needs `FIRECRAWL_API_KEY` in `apps/api/.env`, which was not
  set when this shipped — the client and processor are covered offline by
  the contract tests. No UI shows the stored pages or `result.crawls`; no
  TTL / re-crawl short of clearing the url cell; crawl options are fixed
  constants, not per column.
- **Docs updated:** `docs/features/external-api.md`, `docs/features/run-ai.md`,
  `ARCHITECTURE.md`, `apps/api/.env.example`, both contract headers.
