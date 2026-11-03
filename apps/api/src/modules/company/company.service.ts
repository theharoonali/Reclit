import type { Prisma } from "../../../generated/prisma/client";
import {
  type CompanySummaryGenerator,
  generateCompanySummary,
} from "../../ai/company-ai";
import { buildCompanySummaryPrompt } from "../../ai/company-prompt";
import { type ScrapedPage, scrapePage } from "../../ai/firecrawl";
import { isAiConfigured } from "../../ai/model";
import { describeError } from "../../common/errors";
import { prisma } from "../../db/prisma";
import { userService } from "../user/user.service";
import {
  CompanyAiUnavailableError,
  CompanyScrapeFailedError,
  CompanyWebsiteInvalidError,
  CompanyWebsiteMissingError,
} from "./company.errors";
import {
  type Company,
  type CompanySummary,
  type CrawlCompanyJob,
  companySummarySchema,
  MAX_COMPANY_NAME,
  type ProcessCompanyDocumentJob,
  type SetCompanyWebsiteInput,
  type UpdateCompanyInput,
} from "./company.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The profile itself: one
// company per user, stored as the user's `company*` columns (so `Company.id`
// is the user id); the website's synchronous scrape and the hand-off of the
// background crawl; and the crawl task's writes. Documents are
// company-documents.service.ts; the compiled context and its caches are
// company-context.service.ts.
//
// Two seams: the dispatcher (the Trigger.dev client, registered from
// src/main.ts by src/jobs/company-dispatch.ts — without it a crawl is never
// started and documents stay pending) and the providers (Firecrawl's scrape
// and the model summary — fakes in the contract test).

/** The one document projection: here, nested in the company, and in company-documents.service.ts. */
export const companyDocumentSelect = {
  id: true,
  name: true,
  url: true,
  mimeType: true,
  size: true,
  status: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;

const companySelect = {
  id: true,
  useCases: true,
  useCaseOther: true,
  companyWebsite: true,
  companyName: true,
  companyIconUrl: true,
  companySummary: true,
  companyRules: true,
  crawlStatus: true,
  crawlError: true,
  crawledAt: true,
  pageCount: true,
  companyUpdatedAt: true,
  companyDocuments: {
    select: companyDocumentSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} as const satisfies Prisma.UserSelect;

type CompanyRecord = Prisma.UserGetPayload<{
  select: typeof companySelect;
}>;

function toCompany(record: CompanyRecord): Company {
  return {
    id: record.id,
    useCases: record.useCases,
    useCaseOther: record.useCaseOther,
    website: record.companyWebsite,
    name: record.companyName,
    iconUrl: record.companyIconUrl,
    summary: record.companySummary,
    rules: record.companyRules,
    crawlStatus: record.crawlStatus,
    crawlError: record.crawlError,
    crawledAt: record.crawledAt,
    pageCount: record.pageCount,
    documents: record.companyDocuments,
    updatedAt: record.companyUpdatedAt,
  };
}

/** A profile write in wire names — what `companyData` turns into user columns. */
type CompanyPatch = Partial<
  Pick<
    Company,
    | "useCases"
    | "useCaseOther"
    | "website"
    | "name"
    | "iconUrl"
    | "summary"
    | "rules"
    | "crawlStatus"
    | "crawlError"
    | "crawledAt"
    | "pageCount"
  >
>;

/**
 * The one way a profile write reaches the user row: wire names → columns,
 * and `companyUpdatedAt` moved — the key the compiled context is memoised by
 * and the column the `company_changed` trigger watches.
 */
function companyData({
  website,
  name,
  iconUrl,
  summary,
  rules,
  ...same
}: CompanyPatch): Prisma.UserUpdateManyMutationInput {
  return {
    ...same,
    ...(website !== undefined && { companyWebsite: website }),
    ...(name !== undefined && { companyName: name }),
    ...(iconUrl !== undefined && { companyIconUrl: iconUrl }),
    ...(summary !== undefined && { companySummary: summary }),
    ...(rules !== undefined && { companyRules: rules }),
    companyUpdatedAt: new Date(),
  };
}

/** One profile write by user id. Un-awaited, it batches in `$transaction([...])`. */
const writeCompany = (id: string, patch: CompanyPatch) =>
  prisma.user.update({
    where: { id },
    data: companyData(patch),
    select: { id: true },
  });

/** Moves the profile's `companyUpdatedAt` in the same batch as a document write. */
export const touchCompany = (userId: string) => writeCompany(userId, {});

/**
 * `example.com` → `https://example.com`; any other scheme, a host without a
 * dot, credentials or an unparsable string → null. The fragment is dropped,
 * and a bare origin has no trailing slash.
 */
export function normalizeWebsite(raw: string): string | null {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".") || url.username || url.password) return null;
  url.hash = "";
  return url.pathname === "/" && url.search === ""
    ? url.origin
    : url.toString();
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/** The site's favicon, else its share image, else Google's favicon service for the host. */
export function companyIconUrl(page: ScrapedPage, website: string): string {
  const host = hostOf(website);
  return (
    page.favicon ??
    page.ogImage ??
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`
  );
}

/** What the scrape alone says, when the summary call fails or answers nothing usable. */
function summaryFromPage(page: ScrapedPage): {
  name: string;
  summary: string | null;
} {
  const name = page.siteName ?? page.title ?? hostOf(page.url);
  return {
    name: name.slice(0, MAX_COMPANY_NAME),
    summary: page.description,
  };
}

export type CompanyDispatcher = {
  /** Enqueues the `crawl-company` task. */
  crawl(job: CrawlCompanyJob): Promise<void>;
  /** Enqueues the `process-company-document` task. */
  processDocument(job: ProcessCompanyDocumentJob): Promise<void>;
};

export type CompanyProviders = {
  scrape: (url: string) => Promise<ScrapedPage>;
  summarise: CompanySummaryGenerator;
};

const DEFAULT_PROVIDERS: CompanyProviders = {
  scrape: (url) => scrapePage(url),
  summarise: generateCompanySummary,
};

/** The summary call's answer parsed strictly, or null — never a throw. */
export async function summariseCompany(
  messages: { system: string; prompt: string },
  summarise: CompanySummaryGenerator,
): Promise<CompanySummary | null> {
  try {
    const generated = await summarise(messages);
    const parsed = companySummarySchema.safeParse(generated.summary);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.error("[company] summary failed:", describeError(error).message);
    return null;
  }
}

export class CompanyService {
  private dispatcher: CompanyDispatcher | null = null;
  private providers: CompanyProviders = DEFAULT_PROVIDERS;

  setDispatcher(dispatcher: CompanyDispatcher | null): void {
    this.dispatcher = dispatcher;
  }

  /** Replaces the scrape / summary providers; `null` restores the real ones. */
  setProviders(providers: Partial<CompanyProviders> | null): void {
    this.providers = { ...DEFAULT_PROVIDERS, ...providers };
  }

  /** The current user's company id — the user's own id. */
  async currentId(): Promise<string> {
    return (await userService.me()).id;
  }

  async me(): Promise<Company> {
    const record = await prisma.user.findUniqueOrThrow({
      where: { id: await this.currentId() },
      select: companySelect,
    });
    return toCompany(record);
  }

  /** One company by id (its user's id), or null — what the change stream and the tasks read. */
  async find(id: string): Promise<Company | null> {
    const record = await prisma.user.findUnique({
      where: { id },
      select: companySelect,
    });
    return record ? toCompany(record) : null;
  }

  async update(input: UpdateCompanyInput): Promise<Company> {
    const id = await this.currentId();
    // "Other" without its text would say nothing; its text without "Other"
    // would describe a choice the user took back.
    const clearsOther =
      input.useCases !== undefined && !input.useCases.includes("OTHER");
    const record = await prisma.user.update({
      where: { id },
      data: companyData({
        ...input,
        ...(clearsOther && { useCaseOther: null }),
      }),
      select: companySelect,
    });
    return toCompany(record);
  }

  /**
   * The homepage now (seconds), the whole site in the background (minutes).
   * A failing summary call is not fatal: the page's own title and
   * description stand in until the crawl refines them.
   */
  async setWebsite(input: SetCompanyWebsiteInput): Promise<Company> {
    const url = normalizeWebsite(input.url);
    if (url === null) throw new CompanyWebsiteInvalidError(input.url);
    if (!process.env.FIRECRAWL_API_KEY || !isAiConfigured()) {
      throw new CompanyAiUnavailableError();
    }
    const id = await this.currentId();
    await writeCompany(id, {
      website: url,
      crawlStatus: "SCRAPING",
      crawlError: null,
    });

    let page: ScrapedPage;
    try {
      page = await this.providers.scrape(url);
    } catch (error) {
      const reason = describeError(error).message;
      await writeCompany(id, { crawlStatus: "FAILED", crawlError: reason });
      throw new CompanyScrapeFailedError(url, reason);
    }
    const described =
      (await summariseCompany(
        buildCompanySummaryPrompt(page),
        this.providers.summarise,
      )) ?? summaryFromPage(page);

    // A new website: the old site's page count describes something else.
    await writeCompany(id, {
      name: described.name,
      summary: described.summary,
      iconUrl: companyIconUrl(page, url),
      crawlStatus: "CRAWLING",
      crawledAt: null,
      pageCount: 0,
    });
    return this.startCrawl(id, url);
  }

  /** The background crawl again, for the website already set. */
  async recrawl(): Promise<Company> {
    const id = await this.currentId();
    const { companyWebsite: website } = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: { companyWebsite: true },
    });
    if (!website) throw new CompanyWebsiteMissingError();
    await writeCompany(id, { crawlStatus: "CRAWLING", crawlError: null });
    return this.startCrawl(id, website);
  }

  /**
   * Hands the crawl to the worker. When there is no worker to hand it to, or
   * it refuses, the profile is READY with what the scrape gave.
   */
  private async startCrawl(id: string, url: string): Promise<Company> {
    const dispatched = await this.dispatch((dispatcher) =>
      dispatcher.crawl({ companyId: id, url }),
    );
    if (dispatched !== "sent") {
      await writeCompany(id, { crawlStatus: "READY" });
    }
    return this.me();
  }

  /**
   * `sent` when the worker took the job, `absent` with no worker registered
   * (tests, an api without TRIGGER_SECRET_KEY), `failed` when it refused —
   * logged, never thrown.
   */
  async dispatch(
    send: (dispatcher: CompanyDispatcher) => Promise<void>,
  ): Promise<"sent" | "absent" | "failed"> {
    if (!this.dispatcher) return "absent";
    try {
      await send(this.dispatcher);
      return "sent";
    } catch (error) {
      console.error(
        "[company] could not reach the worker:",
        describeError(error).message,
      );
      return "failed";
    }
  }

  /* ------------------------------------------------- crawl task writes */

  /**
   * Records a crawl of `url` — how many pages it read; the task summarises
   * the pages in memory and they are not kept — unless the website changed
   * while the crawl ran, when nothing is written and false comes back.
   */
  async savePages(
    companyId: string,
    url: string,
    pages: { url: string; title: string | null; markdown: string }[],
  ): Promise<boolean> {
    const { count } = await prisma.user.updateMany({
      where: { id: companyId, companyWebsite: url },
      data: companyData({ pageCount: pages.length }),
    });
    return count > 0;
  }

  /**
   * The crawl's end: READY (with the refined summary when there is one) or
   * FAILED with the reason — the scrape's summary stays. Guarded on the
   * website, so a crawl of a replaced website changes nothing.
   */
  async setCrawlResult(
    companyId: string,
    url: string,
    result: { summary: CompanySummary | null } | { error: string },
  ): Promise<void> {
    const patch: CompanyPatch =
      "error" in result
        ? { crawlStatus: "FAILED", crawlError: result.error.slice(0, 1000) }
        : {
            crawlStatus: "READY",
            crawlError: null,
            crawledAt: new Date(),
            ...(result.summary && {
              name: result.summary.name,
              summary: result.summary.summary,
            }),
          };
    await prisma.user.updateMany({
      where: { id: companyId, companyWebsite: url },
      data: companyData(patch),
    });
  }
}

export const companyService = new CompanyService();
