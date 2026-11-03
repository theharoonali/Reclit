# 043 — Company profile: use cases, website, docs and rules as cached AI context

**Status:** planned
**Scope:** full feature

## Goal

Every AI call in Reclit knows who the user works for and why. A new
account-level **company profile** holds what the user will use Reclit for (one
or more use cases, plus "Other"), their website (scraped and summarised with
Firecrawl + Gemini, shown with the site's icon, then crawled in the
background), the company documents they upload (PDF, images, text — each
digested by Gemini) and free-text company rules. Onboarding collects it in
three new screens before the workspace name; Settings shows and edits it. One
deterministic `<company-context>` block is compiled from it and placed first in
every Gemini system prompt (cells, search, mail, assistant, onboarding,
dashboard generation), so Gemini's implicit prefix cache hits; batch runs also
create an explicit Gemini cache (`providerOptions.google.cachedContent`) once
per batch.

Decided with the user: one profile per account (not per workspace); implicit +
explicit caching; several use cases can be picked; the company screens come
before the workspace screens.

## Backend (Agent 1)

- **Tables** (hand-written migration, `prisma migrate deploy` + `generate`):
  - `enum UseCase { LEAD_RESEARCH HIRING EMAIL_OUTREACH FORM_INTAKE CUSTOMER_INSIGHTS OTHER }`
  - `enum CompanyCrawlStatus { IDLE SCRAPING CRAWLING READY FAILED }`
  - `enum CompanyDocumentStatus { PENDING PROCESSING READY FAILED }`
  - `Company` — `id`, `ownerId` (unique FK `User`, cascade), `useCases UseCase[]`,
    `useCaseOther String?`, `website String?`, `name String?`, `iconUrl String?`,
    `summary String?`, `rules String?`, `crawlStatus` (default `IDLE`),
    `crawlError String?`, `crawledAt DateTime?`, `contextHash String?`,
    `geminiCacheName String?`, `geminiCacheHash String?`,
    `geminiCacheExpiresAt DateTime?`, timestamps.
  - `CompanyPage` — `id`, `companyId` (FK cascade), `url`, `title String?`,
    `markdown`, `createdAt`. The full crawl (`ExternalApi` cannot hold it: its
    `cellId` is a required FK).
  - `CompanyDocument` — `id`, `companyId` (FK cascade), `url`, `name`,
    `mimeType`, `size Int`, `status` (default `PENDING`), `digest String?`,
    `error String?`, timestamps.
  - Trigger `company_notify` on `Company` and `CompanyDocument` →
    `pg_notify('company_changed', companyId)`.
- **Wire shapes** (the contract header repeats these exactly):

  ```ts
  type UseCase = "LEAD_RESEARCH" | "HIRING" | "EMAIL_OUTREACH" | "FORM_INTAKE" | "CUSTOMER_INSIGHTS" | "OTHER";
  type CompanyCrawlStatus = "IDLE" | "SCRAPING" | "CRAWLING" | "READY" | "FAILED";
  type CompanyDocumentStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";
  type CompanyDocument = {
    id: string; name: string; url: string; mimeType: string; size: number;
    status: CompanyDocumentStatus; error: string | null; createdAt: Date; updatedAt: Date;
  };
  type Company = {
    id: string; useCases: UseCase[]; useCaseOther: string | null;
    website: string | null; name: string | null; iconUrl: string | null;
    summary: string | null; rules: string | null;
    crawlStatus: CompanyCrawlStatus; crawlError: string | null; crawledAt: Date | null;
    pageCount: number; documents: CompanyDocument[]; // oldest first
    updatedAt: Date;
  };
  ```

- **Procedures** (`trpc/routers/company.ts`, `protectedProcedure`, in `_app.ts`):

  | Procedure | Kind | Payload | Response | Errors |
  | --- | --- | --- | --- | --- |
  | `company.me` | query | — | `Company` (created on first read) | — |
  | `company.update` | mutation | `{ useCases?: UseCase[] (unique, ≤ 6); useCaseOther?: string \| null (≤ 200); name?: string \| null (≤ 200); summary?: string \| null (≤ 4000); rules?: string \| null (≤ 8000) }` — `useCaseOther` is cleared when `useCases` lacks `OTHER` | `Company` | `BAD_REQUEST` validation |
  | `company.setWebsite` | mutation | `{ url: string (≤ 2048) }` — `example.com` gets `https://` | `Company` with `name`, `iconUrl`, `summary` filled and `crawlStatus: "CRAWLING"` (or `"READY"` if the crawl could not be dispatched) | `BAD_REQUEST COMPANY_WEBSITE_INVALID`, `SERVICE_UNAVAILABLE COMPANY_AI_UNAVAILABLE` (no Firecrawl key), `BAD_GATEWAY COMPANY_SCRAPE_FAILED` |
  | `company.recrawl` | mutation | — | `Company` (`crawlStatus: "CRAWLING"`) | `CONFLICT COMPANY_WEBSITE_MISSING` |
  | `company.addDocument` | mutation | `{ url; name (≤ 255); mimeType; size }` — `url` must be one `POST /files` wrote | `CompanyDocument` (`PENDING`) | `BAD_REQUEST COMPANY_DOCUMENT_TYPE`, `BAD_REQUEST COMPANY_DOCUMENT_TOO_LARGE` (> 15 MB), `BAD_REQUEST COMPANY_DOCUMENT_URL_INVALID`, `CONFLICT COMPANY_DOCUMENT_LIMIT` (10) |
  | `company.removeDocument` | mutation | `{ id }` | `{ id }` (the stored file is deleted best effort) | `NOT_FOUND COMPANY_DOCUMENT_NOT_FOUND` |
  | `company.onChange` | subscription (SSE) | — | yields `Company` on connect and on every change | — |

  Accepted document types: `application/pdf`, `image/png`, `image/jpeg`,
  `image/webp`, `text/plain`, `text/markdown`, `text/csv`.
- **Service methods:** `CompanyService` (`me`, `update`, `setWebsite`,
  `recrawl`, `addDocument`, `removeDocument`, plus worker-side writers
  `savePages`, `setCrawlResult`, `setDocumentDigest`, …) with injectable
  scrape / summarise / dispatch seams; `CompanyContextService.forUser(ownerId)`
  / `forSpreadsheet(spreadsheetId)` → `{ text, hash } | null`, memoised by
  `updatedAt`.
- **AI:** `ai/firecrawl.ts` `scrapePage` (`/v2/scrape`, markdown + metadata);
  `ai/company-prompt.ts` (summary, crawl-summary and document-digest prompts,
  `buildCompanyContext` — deterministic, `<company-context>`, untrusted-data
  wording, caps: summary 4k, rules 8k, each digest 6k, all digests 40k);
  `ai/company-ai.ts` (generators, lenient schemas + strict twins);
  `ai/company-context.ts` `withCompanyContext(system, context)` — block first.
  Icon: scrape `metadata.favicon` → `ogImage` →
  `https://www.google.com/s2/favicons?domain=<host>&sz=128`.
- **Tasks:** `trigger/crawl-company.ts` (`crawlWebsite`, `wait.for` sleep,
  same queue limits as `crawl-website`; save pages → refined summary →
  `READY`; failure → `FAILED`, scrape summary kept);
  `trigger/process-company-document.ts` (`fetchAttachment` → Gemini file part
  → digest → `READY` / `FAILED`); `jobs/company-dispatch.ts`.
- **Context everywhere:** `buildCellMessages` (ai, search, mail), the search
  extraction prompt, the assistant system prompt (via `loadAssistantContext`),
  the onboarding describe / suggest prompts (which also name the use cases),
  and the dashboard analyze / propose / review prompts take an optional
  company context and put it first. Builders stay pure; loaders and tasks fetch.
- **Explicit cache:** `ai/gemini-cache.ts` (raw REST `cachedContents`):
  `ensureCompanyCache` reuses the stored cache when the hash matches and it
  has > 5 min left, otherwise creates one (TTL 1 h; `systemInstruction` = the
  company block + the generic cell preamble), stores it, deletes the old one;
  `null` below Gemini's minimum size or on any error. `run-ai-batch` calls it
  once per batch and passes an optional `cacheName` to each `run-ai-cell`.
  With a cache the ai and mail calls send `providerOptions.google.cachedContent`
  and **no `system`** (the column-specific text moves to the start of the user
  message); search grounding keeps the implicit path. Any cache failure falls
  back to the implicit path.
- **Usage:** cell and assistant usage gain `cachedInputTokens`
  (`usage.inputTokenDetails.cacheReadTokens`).
- **Reused:** `crawlWebsite`, `FirecrawlError`, `fetchAttachment`,
  `mediaTypeFor`, `fileService.remove`, `gemini()`, `UNTRUSTED_DATA_RULE`,
  `loadAssistantContext`, the `LiveFeed` subscription idiom, the
  lenient/strict generator pattern, the dispatcher pattern of
  `run-ai-dispatch.ts`. `db:reset` empties the new tables; the seed gives the
  demo user a small company.

## Frontend (Agent 2)

- **Routes:** `/onboarding` gains three screens before `name`:
  `purpose` → `website` → `documents` → `name` → … `/settings` gains a Company
  section between Profile and Subscription.
- **Components:**
  - `packages/ui` `ChoiceCard` — a checkable card (icon, title, description;
    checkbox semantics; `size` default / compact), with an `exports` entry.
  - `config/use-cases.ts` — the six keys → lucide icon (`Target`, `Users`,
    `Mail`, `ClipboardList`, `Contact`, `Sparkles`) + message keys.
  - `components/onboarding/onboarding-{purpose,website,documents}-screen.tsx`;
    `use-onboarding-wizard.ts` and `lib/onboarding/progress.ts` gain the
    stages and checklist items.
  - `components/company/` — `company-card` (icon `Avatar` with initial
    fallback, name, host, editable summary, crawl line),
    `company-document-list` (status chips, remove), `company-document-upload`
    (multi-file drop zone), hooks `use-company`, `use-company-documents`.
  - `components/settings/company-settings.tsx` — the card, website field +
    Re-scan, use-case chips (compact `ChoiceCard`), rules `Textarea` + Save,
    documents.
  - `lib/company/{use-cases,documents,api}.ts` — accepted types, status →
    message key, error keys.
- **States:** website scraping (orb + spinner), scraped card, crawling line,
  crawl failed line; document uploading / processing / ready / failed;
  company query loading / error in Settings; Other's text field.

## Integration (Agent 3)

- Purpose Next → `company.update { useCases, useCaseOther }`; website Next →
  `company.setWebsite`; summary edit → `company.update { summary }`;
  documents → `uploadFile` then `company.addDocument`, remove →
  `company.removeDocument`; rules → `company.update { rules }`. Every
  mutation sets the `company.me` cache from its response (documents: refetch
  `company.me`); `company.onChange` replaces the `company.me` cache while the
  wizard or Settings is mounted. The wizard resumes at `purpose` when
  `company.me.useCases` is empty.

## Decisions

- Account-level profile (user's choice): it exists before any workspace, so
  onboarding writes it as it goes; per-workspace profiles were rejected.
- Scrape the homepage synchronously, crawl in the background: the user sees
  the summary and icon in seconds; a full crawl takes minutes.
- Digest documents once into text instead of attaching the files to every
  call: the context stays small, deterministic and cacheable.
- Company block first in every system prompt (implicit cache) plus one
  explicit cache per batch (guaranteed discount where the volume is).
- Uploads keep using `POST /files`; no multipart enters `src/trpc`.
- No DOCX documents in this change.

## Risks / open questions

- Gemini's explicit cache refuses `system_instruction` in the request: the
  cell prompt must exist in two shapes; covered by the cache-path test.
- A short company context is below the cache minimum: implicit path only.
- Firecrawl Free plan: one crawl at a time, shared queue with cell crawls.
- The `.cachedInputTokens` field depends on the provider reporting
  `cachedContentTokenCount`.

---

## Outcome

### API (Agent 1)

Shipped as planned: the three tables + enums + `company_notify` /
`company_document_notify` triggers (migration `20261103120000_add_company`),
`modules/company/` (schema, errors, `company.service`,
`company-documents.service`, `company-context.service`, feed, changes),
`trpc/routers/company.ts` with the seven procedures, `scrapePage`,
`company-prompt` / `company-ai` / `company-context` / `gemini-cache`, the
`crawl-company` and `process-company-document` tasks with
`jobs/company-dispatch.ts`, the context first in every prompt, the explicit
cache in `run-ai-batch` / `run-ai-cell`, `cachedInputTokens` in cell and
assistant usage, `db:reset` / seed. The wire shapes are exactly the plan's.
Verified live against Gemini: a cache of the block serves ~98% of a cell's
input tokens, a dead cache falls back to the implicit call, and the implicit
prefix cache alone already serves most of the block on a second call.

Deviations:

- `CompanyContext` is `{ companyId, text, hash }` (not `{ text, hash }`), so
  `ensureCompanyCache(context, deps)` needs no separate id.
- The explicit cache is ensured per **wave**, not once per batch: a batch
  that outlives the cache's hour gets a fresh one; between waves it is a
  reuse read.
- `recrawl` with no worker (or a refusing one) answers `READY`, the same rule
  as `setWebsite`, instead of a `CRAWLING` that would never end.
- `setWebsite`: a failing summary call is not an error — the page's own
  site name / title and meta description stand in; `COMPANY_AI_UNAVAILABLE`
  also fires without the Gemini key (both keys are needed).
- `addDocument`: `mimeType` may be `""` (the extension decides; the stored
  type is the resolved one, `image/jpg` → `image/jpeg`); a document whose
  dispatch the worker refuses is `FAILED` at once.
- `update`: a blank string clears a field, like `null`.
- `company.onChange` yields plain `Company` values, not `tracked` events —
  there is nothing to replay.
- Both Firecrawl tasks share one named `firecrawl` queue (concurrency 1);
  `crawl-website` moved off its own per-task queue.
- `fetchFile` was extracted from `fetchAttachment` for the document task;
  `fileService.ownsUrl` / `uploadBaseUrl` were added for the URL check; the
  test support gained `nextValue` for untracked subscriptions.

### Integration (Agent 3)

Wired as planned; the fixture (`components/company/company-fixture.ts`) is
gone. `lib/company/api.ts` aliases `Company` / `CompanyDocument` /
`CompanyUpdate` (and `UseCase` and the two status unions) to
`RouterOutputs` / `RouterInputs`. `useCompany` reads `company.me`; `update`,
`setWebsite` and `recrawl` write their answer into the `company.me` cache.
`useCompanyDocuments.add` runs `uploadFile` → `company.addDocument` →
invalidates `company.me`, and deletes the upload (`DELETE /files`) when
`addDocument` refuses it; `remove` runs `company.removeDocument` →
invalidates `company.me` (also after a failure, so a document gone
elsewhere drops out). `/settings` prefetches `company.me`. The wizard's
resume reads the real `company.me` (no use cases → `purpose`) with no code
change beyond the hook.

Deviations:

- `company.onChange` opens only where `useCompany({ live: true })` is
  called — the Settings container and `useOnboardingCompany` — not in every
  `useCompany` reader: Settings has four readers, and four SSE streams would
  eat the browser's six connections per host on HTTP/1.1.
- The `COMPANY_*` domain code never reaches the client (`mapDomainError`
  sends the tRPC code and message), so `companyErrorKey(procedure, code)`
  maps per procedure: `setWebsite` BAD_REQUEST → websiteInvalid,
  SERVICE_UNAVAILABLE → aiUnavailable, BAD_GATEWAY → scrapeFailed; `recrawl`
  CONFLICT → websiteMissing; `addDocument` CONFLICT → documentLimit,
  BAD_REQUEST → documentType (size and type are checked before upload);
  `removeDocument` NOT_FOUND → documentNotFound; `update` BAD_REQUEST →
  validation. `COMPANY_DOCUMENT_URL_INVALID` cannot be told apart from the
  other BAD_REQUESTs, so its message key (`documentUrlInvalid`) was dropped.

Verified in headless Chrome against the running api + dashboard on
`/settings`: the section loads `company.me`; a use case picked and unpicked
survives a reload; rules saved survive a reload; "nope" shows the invalid
address error; `https://nextjs.org` fills name, summary and favicon and
moves to "Reading the rest of your site…"; a PNG is uploaded, listed
("Reading" — no worker ran, so it stays `PENDING`) and survives a reload; a
`.exe` is refused before upload; remove empties the list. `/onboarding`
could not be reached without resetting the user: covered by typecheck and
the dashboard tests only.
