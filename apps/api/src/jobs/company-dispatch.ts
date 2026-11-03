import { tasks } from "@trigger.dev/sdk";
import { companyService } from "../modules/company/company.service";
import type { crawlCompanyTask } from "../trigger/crawl-company";
import type { processCompanyDocumentTask } from "../trigger/process-company-document";

// The API-side client of the company tasks: the website crawl and the
// document digest. Like run-ai-dispatch.ts it lives outside src/trigger/
// (bundled into the worker) and outside src/modules/** and src/trpc/**
// (transpiled by the dashboard — AGENTS.md invariant 2), and is registered
// from src/main.ts only, so the test suite never reaches the network. The
// task imports are type-only.

export function registerCompanyDispatcher(): void {
  companyService.setDispatcher({
    // No idempotency key: a re-crawl of the same website is a new crawl.
    crawl: async (job) => {
      await tasks.trigger<typeof crawlCompanyTask>("crawl-company", job, {
        tags: [`company:${job.companyId}`],
      });
    },
    // One digest per document, however often the dispatch is retried.
    processDocument: async (job) => {
      await tasks.trigger<typeof processCompanyDocumentTask>(
        "process-company-document",
        job,
        { idempotencyKey: job.documentId },
      );
    },
  });
}
