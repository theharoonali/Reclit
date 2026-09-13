import { logger, schemaTask } from "@trigger.dev/sdk";
import type { CrawlResolver } from "../ai/cell-crawls";
import { generateCellValue } from "../ai/cell-output";
import { generateSearchCellValue } from "../ai/search-output";
import { describeError } from "../common/errors";
import { externalApiService } from "../modules/external-api/external-api.service";
import { RunAiInvalidCellIdError } from "../modules/run-ai/run-ai.errors";
import {
  isTerminalRunAiStatus,
  runAiJobPayloadSchema,
} from "../modules/run-ai/run-ai.schema";
import { runAiService } from "../modules/run-ai/run-ai.service";
import { parseCellId } from "../modules/spreadsheet/spreadsheet.ids";
import type { CrawlWebsiteOutcome } from "./crawl-website";
import { crawlWebsiteTask } from "./crawl-website";

// One AI or Google Search cell, end to end — the unit of work `run-ai-batch`
// fans out. The orchestrator has already recorded `result.input` on the
// `pending` run, including the node that decides which generator runs; this
// task moves it `running`, asks the model, and `complete`s it (the service
// writes `result.output` into the cell before flipping the status) or
// `fail`s it with the reason. Every transition fires the Postgres trigger, so
// the sheet sees it live. The return value is what the orchestrator reads to
// decide whether the row's series goes on.
//
// No retries: a `failed` run is terminal and must not be revived. A run the
// API already failed (a dispatch that timed out after the job was accepted)
// is left alone, and `onFailure` covers the crash paths the catch cannot
// reach — a maxDuration kill would otherwise leave the cell busy for good.
//
// The run's own `cellId` is parsed here because the row's audio and url
// cells are transcribed and crawled under their *own* cell ids: same sheet,
// same row, their column (`src/ai/cell-transcripts.ts`, `cell-crawls.ts`).
// The budget covers a transcription plus a model call, so it is the config's
// 300 s rather than the model call's own; the crawls run in `crawl-website`
// child tasks and the wait for them is not CPU time.

export type RunAiCellOutcome = { runId: string; status: string };

/** The child task returns `{ recordId, reused, … }`; anything else is a failed crawl. */
const isCrawlOutcome = (output: unknown): output is CrawlWebsiteOutcome =>
  typeof output === "object" &&
  output !== null &&
  typeof (output as { recordId?: unknown }).recordId === "string";

/**
 * The row's url cells, crawled by one `crawl-website` run each — a batch,
 * never `Promise.all` over `triggerAndWait` — then read back from the store.
 * Keyed on the run so a re-triggered batch does not crawl twice; the store
 * is what makes the second row with the same site free.
 */
const crawlViaTask =
  (runId: string): CrawlResolver =>
  async (keys) => {
    if (keys.length === 0) return [];
    const { runs } = await crawlWebsiteTask.batchTriggerAndWait(
      keys.map((key) => ({
        payload: key,
        options: { idempotencyKey: `${runId}:${key.cellId}` },
      })),
    );
    // Only store reads are awaited together here; the waiting happened above.
    return Promise.all(
      runs.map(async (run) => {
        if (!run.ok) return { error: describeError(run.error).message };
        if (!isCrawlOutcome(run.output)) {
          return { error: "the crawl task returned no record" };
        }
        return {
          record: await externalApiService.byId(run.output.recordId),
          reused: run.output.reused,
        };
      }),
    );
  };

export const runAiCellTask = schemaTask({
  id: "run-ai-cell",
  schema: runAiJobPayloadSchema,
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async ({ runId, input }): Promise<RunAiCellOutcome> => {
    const run = await runAiService.byId(runId);
    if (isTerminalRunAiStatus(run.status)) {
      logger.warn("run already finished, nothing to do", {
        runId,
        status: run.status,
      });
      return { runId, status: run.status };
    }
    const address = parseCellId(run.cellId);
    if (!address) throw new RunAiInvalidCellIdError(run.cellId);
    await runAiService.markRunning(runId);
    try {
      // The node decides which generator fills the cell; everything around
      // this line — the transitions, the guards, the failure paths — is the
      // same whichever one runs.
      const { output, model, usage, attachments, ...extra } =
        input.target.node === "google_search"
          ? await generateSearchCellValue(input)
          : await generateCellValue(input, address, {
              crawls: crawlViaTask(runId),
            });
      logger.info("cell generated", {
        runId,
        node: input.target.node,
        model,
        usage,
        attachments,
        ...extra,
      });
      const completed = await runAiService.complete(runId, {
        result: { input, output, model, usage, attachments, ...extra },
      });
      return { runId, status: completed.status };
    } catch (error) {
      const failure = describeError(error);
      logger.error("cell generation failed", { runId, ...failure });
      await runAiService.fail(runId, { result: { input, error: failure } });
      throw error;
    }
  },
  onFailure: async ({ payload, error }) => {
    // Idempotent on a run the catch above already failed.
    await runAiService
      .fail(payload.runId, {
        result: { input: payload.input, error: describeError(error) },
      })
      .catch(() => {});
  },
});
