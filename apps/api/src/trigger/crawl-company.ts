import { logger, schemaTask, wait } from "@trigger.dev/sdk";
import { generateCompanySummary } from "../ai/company-ai";
import { buildCrawlSummaryPrompt } from "../ai/company-prompt";
import { crawlWebsite } from "../ai/firecrawl";
import { describeError } from "../common/errors";
import { crawlCompanyJobSchema } from "../modules/company/company.schema";
import {
  companyService,
  summariseCompany,
} from "../modules/company/company.service";
import { firecrawlQueue } from "./firecrawl-queue";

// The company website's background crawl, after `company.setWebsite` (or
// `recrawl`) answered with the homepage's summary: the whole site through
// Firecrawl → the pages stored as `CompanyPage` → a summary refined from all
// of them → READY. Every write is guarded on the website the job was for, so
// a crawl of a website the user has since replaced changes nothing.
//
// Same shape as `crawl-website`: the polling waits are `wait.for`
// (checkpointed, free, at least FIRECRAWL_POLL_SECONDS = 10 s), the queue is
// the shared one-at-a-time Firecrawl queue, and a transient failure is
// retried with backoff. When every attempt failed, `onFailure` marks the
// profile FAILED with the reason; the scrape's summary stays.

export const crawlCompanyTask = schemaTask({
  id: "crawl-company",
  schema: crawlCompanyJobSchema,
  queue: firecrawlQueue,
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 30_000,
    maxTimeoutInMs: 120_000,
    factor: 2,
  },
  run: async ({ companyId, url }) => {
    const crawl = await crawlWebsite(url, {
      sleep: async (seconds) => {
        await wait.for({ seconds });
      },
    });
    const pages = crawl.pages.map(({ url, title, markdown }) => ({
      url,
      title,
      markdown,
    }));
    if (!(await companyService.savePages(companyId, url, pages))) {
      logger.warn("website replaced during the crawl; result dropped", {
        companyId,
        url,
      });
      return { companyId, pages: 0, refined: false };
    }
    const company = await companyService.find(companyId);
    const summary = await summariseCompany(
      buildCrawlSummaryPrompt({
        url,
        name: company?.name ?? null,
        summary: company?.summary ?? null,
        pages,
      }),
      generateCompanySummary,
    );
    await companyService.setCrawlResult(companyId, url, { summary });
    logger.info("company website crawled", {
      companyId,
      url,
      pages: pages.length,
      creditsUsed: crawl.creditsUsed,
      refined: summary !== null,
    });
    return { companyId, pages: pages.length, refined: summary !== null };
  },
  onFailure: async ({ payload, error }) => {
    await companyService
      .setCrawlResult(payload.companyId, payload.url, {
        error: describeError(error).message,
      })
      .catch(() => {});
  },
});
