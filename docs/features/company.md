# `company`

**Purpose:** the account-level company profile — use cases, website (scraped,
summarised and crawled), uploaded documents (digested by Gemini) and company
rules — compiled into the one `<company-context>` block that starts every
Gemini prompt, plus the explicit Gemini cache built from it for batch runs.

**Contract:** `apps/api/src/__tests__/company.api.test.ts` — payloads,
responses, error codes and every client-visible behaviour live in its header.
Do not duplicate them here.

## Table `Company`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String` | pk, `@default(uuid())` |
| `ownerId` | `String` | unique, fk `User` (cascade) — one profile per user |
| `useCases` | `UseCase[]` | `LEAD_RESEARCH HIRING EMAIL_OUTREACH FORM_INTAKE CUSTOMER_INSIGHTS OTHER` |
| `useCaseOther` | `String?` | ≤ 200; only kept while `useCases` has `OTHER` |
| `website` | `String?` | normalised by `normalizeWebsite` |
| `name` / `iconUrl` / `summary` | `String?` | from the scrape and the crawl, editable (`name`, `summary`) |
| `rules` | `String?` | ≤ 8000, the user's standing instructions |
| `crawlStatus` | `CompanyCrawlStatus` | `IDLE` → `SCRAPING` → `CRAWLING` → `READY` / `FAILED` |
| `crawlError` / `crawledAt` | `String?` / `DateTime?` | the last crawl's outcome |
| `contextHash` | `String?` | sha256 of the compiled block (bookkeeping) |
| `geminiCacheName` / `geminiCacheHash` / `geminiCacheExpiresAt` | `String?` / `String?` / `DateTime?` | the explicit cache (bookkeeping) |
| `createdAt` / `updatedAt` | `DateTime` | `updatedAt` also moves on every document write |

`CompanyPage` (`companyId` fk cascade, indexed; `url`, `title?`, `markdown`,
`createdAt`) holds the background crawl — `ExternalApi` cannot, its `cellId`
is a required fk. `CompanyDocument` (`companyId` fk cascade; `url`, `name`,
`mimeType`, `size`, `status` `PENDING PROCESSING READY FAILED`, `digest?`,
`error?`, timestamps; index `(companyId, createdAt)`).

Migration: `apps/api/prisma/migrations/20261103120000_add_company/` — the
tables, plus triggers `company_notify` (Company; silent when `updatedAt` did
not move) and `company_document_notify` (insert, update, delete) that
`pg_notify('company_changed', companyId)`.

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | `Company`, `CompanyPage`, `CompanyDocument`, three enums |
| `apps/api/src/modules/company/company.schema.ts` | schema | wire shapes, inputs, `companySummarySchema` (strict twin), job payloads, caps |
| `apps/api/src/modules/company/company.errors.ts` | errors | the nine `COMPANY_*` errors |
| `apps/api/src/modules/company/company.service.ts` | service | `currentId` / `me` / `find` / `update` / `setWebsite` / `recrawl`, the crawl task's `savePages` / `setCrawlResult`, the dispatcher and provider seams, `normalizeWebsite`, `companyIconUrl`, `touchCompany`, `summariseCompany` |
| `apps/api/src/modules/company/company-documents.service.ts` | service | `add` / `remove`, the document task's `start` / `finish` |
| `apps/api/src/modules/company/company-context.service.ts` | service | `forUser` / `forSpreadsheet` / `forCurrentUser` → `CompanyContext \| null` (memoised by `updatedAt`), the bookkeeping writes (`contextHash`, `read/writeGeminiCache`) |
| `apps/api/src/modules/company/company.feed.ts` | feed | `LiveFeed` on `company_changed` |
| `apps/api/src/modules/company/company-changes.service.ts` | service | the `onChange` generator |
| `apps/api/src/trpc/routers/company.ts` | router | the seven procedures |
| `apps/api/src/ai/company-context.ts` | ai (pure) | `CompanyContext`, `withCompanyContext(system, context)` — block first |
| `apps/api/src/ai/company-prompt.ts` | ai (pure) | `compileCompanyContext`, `COMPANY_CONTEXT_CAPS`, `USE_CASE_LABELS`, the summary / crawl-summary / digest prompts |
| `apps/api/src/ai/company-ai.ts` | ai | `generateCompanySummary` (lenient `Output.object`), `generateDocumentDigest` (file part) |
| `apps/api/src/ai/firecrawl.ts` | ai | `scrapePage` (`POST /v2/scrape`) next to `crawlWebsite` |
| `apps/api/src/ai/gemini-cache.ts` | ai | `ensureCompanyCache`, `createCachedContent`, `deleteCachedContent` (raw REST `cachedContents`) |
| `apps/api/src/trigger/crawl-company.ts` | task | crawl → pages → refined summary → READY / FAILED |
| `apps/api/src/trigger/process-company-document.ts` | task | fetch → digest → READY / FAILED |
| `apps/api/src/trigger/firecrawl-queue.ts` | queue | `firecrawl`, concurrency 1, shared with `crawl-website` |
| `apps/api/src/jobs/company-dispatch.ts` | job client | registers the dispatcher from `src/main.ts` |

## Procedures

| Procedure | Kind | Service method | Errors |
| --- | --- | --- | --- |
| `company.me` | query | `CompanyService.me` | — |
| `company.update` | mutation | `CompanyService.update` | validation |
| `company.setWebsite` | mutation | `CompanyService.setWebsite` | validation, `COMPANY_WEBSITE_INVALID`, `COMPANY_AI_UNAVAILABLE`, `COMPANY_SCRAPE_FAILED` |
| `company.recrawl` | mutation | `CompanyService.recrawl` | `COMPANY_WEBSITE_MISSING` |
| `company.addDocument` | mutation | `CompanyDocumentsService.add` | validation, `COMPANY_DOCUMENT_TYPE`, `COMPANY_DOCUMENT_TOO_LARGE`, `COMPANY_DOCUMENT_URL_INVALID`, `COMPANY_DOCUMENT_LIMIT` |
| `company.removeDocument` | mutation | `CompanyDocumentsService.remove` | validation, `COMPANY_DOCUMENT_NOT_FOUND` |
| `company.onChange` | subscription | `CompanyChangesService.changes` | — |

## Behaviour

- **One per user, lazily.** `currentId()` resolves `userService.me()` and
  creates the empty row on first use (a racing second create is caught as a
  unique violation and re-read). No procedure takes an id.
- **Seams.** `setDispatcher` (the Trigger.dev client, `src/jobs/company-dispatch.ts`)
  and `setProviders` (Firecrawl's scrape + the Gemini summary; the contract
  test's fakes). `dispatch()` answers `sent` / `absent` / `failed` and never
  throws: a crawl not `sent` leaves the profile `READY`; a document whose
  dispatch `failed` is `FAILED` at once, one with no worker stays `PENDING`.
- **`setWebsite`** writes `SCRAPING` before the scrape so `onChange` shows it,
  `FAILED` + reason when the scrape throws, and on success replaces the
  pages, name, summary and icon in one transaction before dispatching. A
  failing summary call falls back to the page's own metadata (`summariseCompany`
  never throws).
- **Crawl writes are guarded on the website** the job was for (`savePages`
  checks it, `setCrawlResult` is an `updateMany` filtered by it), so a crawl
  of a replaced website is dropped.
- **Documents.** Only URLs `fileService.ownsUrl` accepts — exactly what
  `POST /files` wrote — so the worker never fetches a client-chosen address.
  The type is resolved with `mediaTypeFor` (declared, else extension) plus two
  aliases. Every document write runs in one transaction with `touchCompany`,
  which moves `Company.updatedAt`.
- **The compiled context** (`compileCompanyContext`): one block, fixed order —
  the rule sentence, name + website, use cases, `<company-summary>`,
  `<company-rules>`, then each READY digest as `<company-document>`, oldest
  first; caps summary 4k, rules 8k, each digest 6k, all digests 40k (later
  documents cut first); our own tags are stripped from free text. Null when
  there is nothing to say. The rules are framed as the user's standing
  instructions; everything else as untrusted data.
- **Memo + bookkeeping.** `companyContextService` keeps one compiled context per
  company per process, keyed by `updatedAt`: a hit is one indexed read.
  `contextHash` and the Gemini cache columns are written by `writeQuietly` —
  an `updateMany` that sets `updatedAt` to its own value only if unchanged —
  so they neither invalidate the memo nor fire `company_notify`.
- **Where the block goes.** `withCompanyContext(system, context)` puts it
  first in: `buildCellMessages` (ai / google_search / email cells; context
  from `forSpreadsheet` in `run-ai-cell`), `buildSearchExtractMessages`,
  `buildAssistantSystemPrompt` (via `loadAssistantContext` →
  `toPromptContext`), `buildDescribePrompt` / `buildSuggestColumnsPrompt`
  (`forCurrentUser`, the suggest prompt also asks for columns serving the use
  cases), and the dashboard generation's analyze / propose / review prompts.
  Builders stay pure; loaders and tasks fetch.
- **Explicit cache** (`ensureCompanyCache`): `systemInstruction` =
  `cachedCellSystem(context)` (the block + `CELL_PREAMBLE`, which every cell's
  implicit system also starts with), model `models/gemini-2.5-flash`, TTL
  3600 s. Reused when `cacheKey(model, instruction)` matches and > 5 min are
  left; otherwise created, stored, and the old one deleted. Null below an
  estimated 1024 tokens (chars / 4) or on any error, including Gemini's own
  "too small". `run-ai-batch` asks once per wave and passes `cacheName` in
  each `run-ai-cell` payload; `cellCalls` builds both call shapes and
  `withCacheFallback` retries a failed cached call on the implicit path.
- **Stream.** `company.onChange` subscribes to the feed before its first read,
  yields the whole profile, re-reads on every notice for its company (or a
  resync) and skips a state equal to the last one sent. Not `tracked`: there
  is nothing to replay.

## Reusable pieces

- `withCompanyContext` + a `company?: CompanyContext | null` parameter is how
  any new prompt builder gets the profile; fetch it with
  `companyContextService.forSpreadsheet` / `forUser` / `forCurrentUser`.
- `cellCalls` + `withCacheFallback` for any further call that should run on
  the batch cache (no tools allowed on a cached call).
- `scrapePage` for any one-page read; `fetchFile` (`ai/cell-attachments.ts`)
  for any capped download; `firecrawlQueue` for any Firecrawl task.

## Used by

- `/onboarding` ([route doc](../routes/onboarding.md)) — the purpose, website
  and documents screens.
- `/settings` ([route doc](../routes/settings.md)) — the Company section.
