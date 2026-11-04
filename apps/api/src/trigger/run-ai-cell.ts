import { batch, logger, schemaTask } from "@trigger.dev/sdk";
import type { SourceResolver } from "../ai/cell-output";
import { generateCellValue } from "../ai/cell-output";
import { generateEmailCellValue } from "../ai/email-output";
import { generateSearchCellValue } from "../ai/search-output";
import { describeError } from "../common/errors";
import { companyContextService } from "../modules/company/company-context.service";
import type { ExternalApi } from "../modules/external-api/external-api.schema";
import { externalApiService } from "../modules/external-api/external-api.service";
import { RunAiInvalidCellIdError } from "../modules/run-ai/run-ai.errors";
import {
  isTerminalRunAiStatus,
  runAiJobPayloadSchema,
} from "../modules/run-ai/run-ai.schema";
import { runAiService } from "../modules/run-ai/run-ai.service";
import { parseCellId } from "../modules/spreadsheet/spreadsheet.ids";
import type { ConvertToMarkdownOutcome } from "./convert-to-markdown";
import { convertToMarkdownTask } from "./convert-to-markdown";
import type { CrawlWebsiteOutcome } from "./crawl-website";
import { crawlWebsiteTask } from "./crawl-website";

// One AI, Google Search or Mail cell, end to end — the unit of work `run-ai-batch`
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
// The run's own `cellId` is parsed here because the row's file, audio and
// url cells are converted and crawled under their *own* cell ids: same
// sheet, same row, their column (`src/ai/cell-markdown.ts`, `cell-crawls.ts`).
// Conversions and crawls run in `convert-to-markdown` and `crawl-website`
// child tasks, and the wait for them is not CPU time.

export type RunAiCellOutcome = { runId: string; status: string };

/** Both child tasks return `{ recordId, reused, … }`; anything else is a failed source. */
const isRecordOutcome = (
  output: unknown,
): output is CrawlWebsiteOutcome | ConvertToMarkdownOutcome =>
  typeof output === "object" &&
  output !== null &&
  typeof (output as { recordId?: unknown }).recordId === "string";

type ChildRun = { ok: true; output: unknown } | { ok: false; error: unknown };

/** One finished child run as the record it stored, read back from the store. */
async function recordOf(
  run: ChildRun,
): Promise<{ record: ExternalApi; reused: boolean } | { error: string }> {
  if (!run.ok) return { error: describeError(run.error).message };
  if (!isRecordOutcome(run.output)) {
    return { error: "the task returned no record" };
  }
  return {
    record: await externalApiService.byId(run.output.recordId),
    reused: run.output.reused,
  };
}

/**
 * The row's url cells crawled by `crawl-website` and its uncached file,
 * audio and YouTube cells converted by `convert-to-markdown` — ONE batch,
 * since Trigger.dev refuses two waits at once — then read back from the
 * store. Keyed on the run so a re-triggered batch does not redo them; the
 * store is what makes the second row with the same source free.
 */
const sourcesViaTask =
  (runId: string): SourceResolver =>
  async ({ crawls, conversions }) => {
    const options = (cellId: string) => ({
      idempotencyKey: `${runId}:${cellId}`,
    });
    const { runs } = await batch.triggerByTaskAndWait([
      ...crawls.map((key) => ({
        task: crawlWebsiteTask,
        payload: key,
        options: options(key.cellId),
      })),
      ...conversions.map((key) => ({
        task: convertToMarkdownTask,
        payload: key,
        options: options(key.cellId),
      })),
    ]);
    // Only store reads are awaited together here; the waiting happened above.
    const records = await Promise.all(
      (runs as ChildRun[]).map((run) => recordOf(run)),
    );
    return {
      crawls: records.slice(0, crawls.length),
      conversions: records.slice(crawls.length),
    };
  };

export const runAiCellTask = schemaTask({
  id: "run-ai-cell",
  schema: runAiJobPayloadSchema,
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async ({ runId, input, cacheName }): Promise<RunAiCellOutcome> => {
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
    // Whose work this is: the sheet's owner's company, first in every prompt.
    // A profile that cannot be read costs the cell its context, not its run.
    const company = await companyContextService
      .forSpreadsheet(address.sheetId)
      .catch(() => null);
    // What the generator produced, kept for the failure path: a mail cell
    // has already sent its emails by the time `complete` writes the cell, so
    // a refused write must still leave `result.emails` on the failed run.
    let generated: Record<string, unknown> = {};
    try {
      // The node decides which generator fills the cell; everything around
      // this line — the transitions, the guards, the failure paths — is the
      // same whichever one runs.
      const { output, model, usage, attachments, ...extra } =
        input.target.node === "google_search"
          ? await generateSearchCellValue(input, company)
          : input.target.node === "email"
            ? await generateEmailCellValue(input, {
                runId,
                company,
                cacheName,
              })
            : await generateCellValue(
                input,
                address,
                { sources: sourcesViaTask(runId) },
                { company, cacheName },
              );
      generated = { model, usage, attachments, ...extra };
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
      await runAiService.fail(runId, {
        result: { input, ...generated, error: failure },
      });
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
