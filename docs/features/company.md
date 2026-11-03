# `company`

**Purpose:** the account-level company profile — use cases, website (scraped,
summarised and crawled), uploaded documents (digested by the model) and
company rules — compiled into the one `<company-context>` block that starts
every model prompt, plus the explicit prompt cache built from it for batch
runs.

**Contract:** `apps/api/src/__tests__/company.api.test.ts` — payloads,
responses, error codes and every client-visible behaviour live in its header.
Do not duplicate them here.

## Columns on `User`

The profile is not a table of its own: one per user, stored as columns of the
user row ([user.md](user.md)). On the wire `Company` keeps its own shape — its
`id` is the user id, `website` / `name` / `iconUrl` / `summary` / `rules` are
the `company*` columns, `updatedAt` is `companyUpdatedAt`.

| Column | Type | Notes |
| --- | --- | --- |
| `useCases` | `UseCase[]` | default `[]`; `LEAD_RESEARCH HIRING EMAIL_OUTREACH FORM_INTAKE CUSTOMER_INSIGHTS OTHER` |
| `useCaseOther` | `String?` | ≤ 200; only kept while `useCases` has `OTHER` |
| `companyWebsite` | `String?` | normalised by `normalizeWebsite` |
| `companyName` / `companyIconUrl` / `companySummary` | `String?` | from the scrape and the crawl, editable (`name`, `summary`) |
| `companyRules` | `String?` | ≤ 8000, the user's standing instructions |
| `crawlStatus` | `CompanyCrawlStatus` | default `IDLE`; `IDLE` → `SCRAPING` → `CRAWLING` → `READY` / `FAILED` |
| `crawlError` / `crawledAt` | `String?` / `DateTime?` | the last crawl's outcome |
| `pageCount` | `Int` | default 0; how many pages the last background crawl read (the pages themselves are not kept) |
| `contextHash` | `String?` | sha256 of the compiled block (bookkeeping) |
| `promptCacheName` / `promptCacheHash` / `promptCacheExpiresAt` | `String?` / `String?` / `DateTime?` | the explicit prompt cache (bookkeeping) |
| `companyUpdatedAt` | `DateTime` | default `now()`; moves on every profile or document write and on nothing else — the context memo key and what the notify trigger watches |

`CompanyDocument` (`userId` fk cascade → `User`; `url`, `name`, `mimeType`,
`size`, `status` `PENDING PROCESSING READY FAILED`, `digest?`, `error?`,
timestamps; index `(userId, createdAt)`).

Migrations: `apps/api/prisma/migrations/20261103120000_add_company/`,
`apps/api/prisma/migrations/20261103180000_consolidate_tables/` (the profile
folded into `User`, the document's `userId`). Triggers that
`pg_notify('company_changed', userId)`: `user_company_notify` (`AFTER UPDATE`
on `User`; only when `companyUpdatedAt` moved — `user.update`, the onboarding
flag and the bookkeeping writes stay silent) and `company_document_notify`
(insert, update, delete on `CompanyDocument`).

## Files

| Path | Layer | Responsibility |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | model | the `User` company columns, `CompanyDocument`, three enums |
| `apps/api/src/modules/company/company.schema.ts` | schema | wire shapes, inputs, `companySummarySchema` (strict twin), job payloads, caps |
| `apps/api/src/modules/company/company.errors.ts` | errors | the nine `COMPANY_*` errors |
| `apps/api/src/modules/company/company.service.ts` | service | `currentId` (the user id) / `me` / `find` / `update` / `setWebsite` / `recrawl`, the crawl task's `savePages` (records `pageCount` only) / `setCrawlResult`, the dispatcher and provider seams, `companyData` (wire names → `User` columns + `companyUpdatedAt`), `normalizeWebsite`, `companyIconUrl`, `touchCompany`, `summariseCompany` |
| `apps/api/src/modules/company/company-documents.service.ts` | service | `add` / `remove`, the document task's `start` / `finish` |
| `apps/api/src/modules/company/company-context.service.ts` | service | `forUser` / `forSpreadsheet` / `forCurrentUser` → `CompanyContext \| null` (memoised by `companyUpdatedAt`), the bookkeeping writes (`contextHash`, `readPromptCache` / `writePromptCache`), `PromptCacheState` |
| `apps/api/src/modules/company/company.feed.ts` | feed | `LiveFeed` on `company_changed` |
| `apps/api/src/modules/company/company-changes.service.ts` | service | the `onChange` generator |
| `apps/api/src/trpc/routers/company.ts` | router | the seven procedures |
| `apps/api/src/ai/company-context.ts` | ai (pure) | `CompanyContext`, `withCompanyContext(system, context)` — block first |
| `apps/api/src/ai/company-prompt.ts` | ai (pure) | `compileCompanyContext`, `COMPANY_CONTEXT_CAPS`, `USE_CASE_LABELS`, the summary / crawl-summary / digest prompts |
| `apps/api/src/ai/company-ai.ts` | ai | `generateCompanySummary` (lenient `Output.object`), `generateDocumentDigest` (file part) |
| `apps/api/src/ai/firecrawl.ts` | ai | `scrapePage` (`POST /v2/scrape`) next to `crawlWebsite` |
| `apps/api/src/ai/prompt-cache.ts` | ai | `ensureCompanyCache`, `createCachedContent`, `deleteCachedContent` (raw REST against `promptCacheApi` from `ai/model.ts`), `PromptCacheStore`, `cacheKey`, `estimateTokens`, `PROMPT_CACHE_TTL_SECONDS` / `_MIN_REMAINING_MS` / `_MIN_TOKENS` |
| `apps/api/src/trigger/crawl-company.ts` | task | crawl → page count → refined summary → READY / FAILED |
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

- **One per user, always there.** The profile is the user row's columns, so
  it exists as soon as the user does; `currentId()` is `userService.me()`'s
  id. No procedure takes an id.
- **Every profile write goes through `companyData`**, which maps wire names
  to `User` columns and moves `companyUpdatedAt` — the memo key and the
  column `user_company_notify` watches.
- **Seams.** `setDispatcher` (the Trigger.dev client, `src/jobs/company-dispatch.ts`)
  and `setProviders` (Firecrawl's scrape + the model summary; the contract
  test's fakes). `dispatch()` answers `sent` / `absent` / `failed` and never
  throws: a crawl not `sent` leaves the profile `READY`; a document whose
  dispatch `failed` is `FAILED` at once, one with no worker stays `PENDING`.
- **`setWebsite`** writes `SCRAPING` before the scrape so `onChange` shows it,
  `FAILED` + reason when the scrape throws, and on success writes the name,
  summary and icon (and resets `pageCount` to 0) before dispatching. A
  failing summary call falls back to the page's own metadata (`summariseCompany`
  never throws).
- **Crawl writes are guarded on the website** the job was for (`savePages`
  and `setCrawlResult` are `updateMany`s filtered by `companyWebsite`), so a
  crawl of a replaced website is dropped. The task summarises the crawled
  pages in memory; only their count is stored.
- **Documents.** Only URLs `fileService.ownsUrl` accepts — exactly what
  `POST /files` wrote — so the worker never fetches a client-chosen address.
  The type is resolved with `mediaTypeFor` (declared, else extension) plus two
  aliases. Every document write runs in one transaction with `touchCompany`,
  which moves `User.companyUpdatedAt`.
- **The compiled context** (`compileCompanyContext`): one block, fixed order —
  the rule sentence, name + website, use cases, `<company-summary>`,
  `<company-rules>`, then each READY digest as `<company-document>`, oldest
  first; caps summary 4k, rules 8k, each digest 6k, all digests 40k (later
  documents cut first); our own tags are stripped from free text. Null when
  there is nothing to say. The rules are framed as the user's standing
  instructions; everything else as untrusted data.
- **Memo + bookkeeping.** `companyContextService` keeps one compiled context per
  user per process, keyed by `companyUpdatedAt`: a hit is one indexed read.
  `contextHash` and the `promptCache*` columns are written by `writeQuietly` —
  an `updateMany` guarded on `companyUpdatedAt` that leaves it alone and sets
  `updatedAt` to its own value — so they neither invalidate the memo nor fire
  `user_company_notify`.
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
  implicit system also starts with), model `defaultModelId()` (named by
  `promptCacheApi.modelPath`), TTL `PROMPT_CACHE_TTL_SECONDS` 3600 s. Reused
  when `cacheKey(model, instruction)` matches and > 5 min are left; otherwise
  created, stored (`writePromptCache`), and the old one deleted. Null below an
  estimated `PROMPT_CACHE_MIN_TOKENS` (1024, chars / 4) or on any error,
  including the provider's own "too small". `run-ai-batch` asks once per wave and passes `cacheName` in
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
