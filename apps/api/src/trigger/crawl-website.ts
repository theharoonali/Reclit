import { logger, schemaTask, wait } from "@trigger.dev/sdk";
import { resolveCrawlRecord } from "../ai/cell-crawls";
import { crawlWebsite } from "../ai/firecrawl";
import {
  crawlWebsiteJobSchema,
  websiteCrawlOutputSchema,
} from "../modules/external-api/external-api.schema";

// The general crawl: one website → its pages, stored in `ExternalApi` under
// the cell that holds the URL and reused from any cell that already has it.
// `run-ai-cell` triggers one per url cell of a running row; anything else
// that needs a site crawled triggers it the same way and reads the record
// back by id — the content stays in the store, the task returns only what
// happened.
//
// The store is checked before Firecrawl is called, so a retry after a
// stored result — or a second caller for the same URL — never crawls twice.
// The polling waits are Trigger.dev `wait.for`s: checkpointed, free, and
// not counted against `maxDuration` (CPU time). One at a time (`queue`): the
// Firecrawl free plan allows two crawl starts a minute, and a 429 — or any
// transient failure — is retried with backoff.

export type CrawlWebsiteOutcome = {
  recordId: string;
  reused: boolean;
  pages: number;
  characters: number;
};

export const crawlWebsiteTask = schemaTask({
  id: "crawl-website",
  schema: crawlWebsiteJobSchema,
  queue: { concurrencyLimit: 1 },
  maxDuration: 300,
  retry: {
    maxAttempts: 4,
    minTimeoutInMs: 30_000,
    maxTimeoutInMs: 120_000,
    factor: 2,
  },
  run: async ({ cellId, url }): Promise<CrawlWebsiteOutcome> => {
    const { record, reused } = await resolveCrawlRecord(
      { cellId, url },
      {
        crawl: (target) =>
          crawlWebsite(target, {
            sleep: async (seconds) => {
              await wait.for({ seconds });
            },
          }),
      },
    );
    const output = websiteCrawlOutputSchema.parse(record.output);
    const characters = output.pages.reduce(
      (sum, page) => sum + page.characters,
      0,
    );
    logger.info("website crawled", {
      cellId,
      url,
      reused,
      pages: output.pages.length,
      characters,
      creditsUsed: output.creditsUsed,
    });
    return {
      recordId: record.id,
      reused,
      pages: output.pages.length,
      characters,
    };
  },
});
