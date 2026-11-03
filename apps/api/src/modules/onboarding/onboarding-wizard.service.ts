import { isAiConfigured } from "../../ai/model";
import {
  generateColumnSuggestions,
  type SuggestGeneration,
  type SuggestGenerator,
} from "../../ai/onboarding-ai";
import { buildSuggestColumnsPrompt } from "../../ai/onboarding-prompt";
import { describeError } from "../../common/errors";
import { readAllRows } from "../assistant/assistant-context";
import { companyContextService } from "../company/company-context.service";
import { dashboardGenerationControlService } from "../dashboard-generation/dashboard-generation-control.service";
import { MAX_RUN_AI_BATCH_CELLS } from "../run-ai/run-ai.schema";
import { isRunnable, runAiBatchService } from "../run-ai/run-ai-batch.service";
import { SpreadsheetNotFoundError } from "../spreadsheet/spreadsheet.errors";
import { spreadsheetService } from "../spreadsheet/spreadsheet.service";
import { userService } from "../user/user.service";
import { workspaceService } from "../workspace/workspace.service";
import {
  OnboardingAiFailedError,
  OnboardingAiUnavailableError,
  OnboardingAlreadyCompletedError,
} from "./onboarding.errors";
import {
  type FinishOnboardingInput,
  MAX_SUGGESTED_COLUMNS,
  type OnboardingFinish,
  type OnboardingSkip,
  type OnboardingSuggestions,
  type SkipOnboardingInput,
  type SuggestColumnsInput,
  type SuggestedColumn,
  suggestedColumnSchema,
} from "./onboarding.schema";

// The tRPC half of the wizard, parser-free: `suggestColumns` works from the
// parse summary `describe` handed the client (no file, nothing read),
// `finish` runs the new sheet's AI columns, sets the flag and starts the
// dashboard generation, and `skip` creates an empty workspace and sets the
// flag. Prisma-free too — every read and write goes through the other
// features' services. The generator is injectable so the contract test covers
// the filtering without a key.

export type SuggestDeps = { generate: SuggestGenerator };

/** The sheet's own uniqueness rule: trimmed, case-insensitive. */
const nameKey = (name: string): string => name.trim().toLowerCase();

/** How many rows one batch may run across `columnCount` columns, within the cell cap. */
export function rowBudget(rowLimit: number, columnCount: number): number {
  return Math.min(
    rowLimit,
    Math.floor(MAX_RUN_AI_BATCH_CELLS / Math.max(columnCount, 1)),
  );
}

export class OnboardingWizardService {
  /**
   * Up to five AI columns for the described sheet. Each proposal is parsed
   * strictly; one that fails, repeats a name (the file's or an earlier
   * proposal's) or lands past the cap is skipped, never fatal. No usable
   * column means the model needs more context, whatever it said.
   */
  async suggestColumns(
    input: SuggestColumnsInput,
    deps: SuggestDeps = { generate: generateColumnSuggestions },
  ): Promise<OnboardingSuggestions> {
    if (!isAiConfigured()) {
      throw new OnboardingAiUnavailableError();
    }
    const messages = buildSuggestColumnsPrompt(
      input,
      MAX_SUGGESTED_COLUMNS,
      await companyContextService.forCurrentUser(),
    );
    let generated: SuggestGeneration;
    try {
      generated = await deps.generate(messages);
    } catch (error) {
      throw new OnboardingAiFailedError(describeError(error).message);
    }

    const taken = new Set(input.columns.map((column) => nameKey(column.name)));
    const columns: SuggestedColumn[] = [];
    let skipped = 0;
    for (const raw of generated.columns) {
      const parsed = suggestedColumnSchema.safeParse(raw);
      const key = parsed.success ? nameKey(parsed.data.name) : null;
      if (
        !parsed.success ||
        key === null ||
        taken.has(key) ||
        columns.length >= MAX_SUGGESTED_COLUMNS
      ) {
        skipped += 1;
        continue;
      }
      taken.add(key);
      columns.push(parsed.data);
    }
    const needsMoreContext = generated.needsMoreContext || columns.length === 0;
    const question = needsMoreContext
      ? generated.question?.trim().slice(0, 500) || null
      : null;
    return {
      columns,
      needsMoreContext,
      question,
      skipped,
      model: generated.model,
      usage: generated.usage,
    };
  }

  /**
   * No file: the named workspace with its empty sheet, and the flag. The
   * dashboard then shows its empty state.
   */
  async skip({ name }: SkipOnboardingInput): Promise<OnboardingSkip> {
    const me = await userService.me();
    if (me.onboardingCompleted) throw new OnboardingAlreadyCompletedError();
    const workspace = await workspaceService.create({ name });
    const user = await userService.completeOnboarding();
    return { user, workspace };
  }

  /**
   * The last step: every runnable column of the workspace's sheet over its
   * first stored rows (within `rowLimit` and the batch's cell cap) as one
   * run-ai batch, then the flag, then the dashboard generation that waits for
   * that batch. A dispatch failure of the batch propagates with the flag
   * still false, so the step can be retried; a generation that cannot start
   * (no AI key, dispatch failed) answers `generationId: null` — the
   * dashboard's own pill is the fallback.
   */
  async finish({
    workspaceId,
    rowLimit,
  }: FinishOnboardingInput): Promise<OnboardingFinish> {
    const me = await userService.me();
    if (me.onboardingCompleted) throw new OnboardingAlreadyCompletedError();
    const workspace = await workspaceService.byId(workspaceId);
    const sheetId = workspace.spreadsheetId;
    if (!sheetId) throw new SpreadsheetNotFoundError(workspace.id);

    const columns = (await spreadsheetService.columnsOf(sheetId)).filter(
      isRunnable,
    );
    const rowIndexes =
      columns.length === 0
        ? []
        : (
            await readAllRows(sheetId, rowBudget(rowLimit, columns.length))
          ).rows.map((row) => row.index);
    const runs =
      columns.length > 0 && rowIndexes.length > 0
        ? await runAiBatchService.runCells({
            id: sheetId,
            rowIndexes,
            columnIndexes: columns.map((column) => column.index),
          })
        : [];

    const user = await userService.completeOnboarding();
    const batchId = runs[0]?.batchId ?? null;
    return {
      user,
      batchId,
      cellCount: runs.length,
      rowCount: rowIndexes.length,
      columnCount: columns.length,
      generationId: await this.startGeneration(workspaceId, batchId),
    };
  }

  /** The generation after the batch — best effort: the flag is already set, the pill can retry. */
  private async startGeneration(
    workspaceId: string,
    awaitBatchId: string | null,
  ): Promise<string | null> {
    try {
      const generation = await dashboardGenerationControlService.start({
        workspaceId,
        source: "onboarding",
        awaitBatchId,
      });
      return generation.id;
    } catch (error) {
      console.error(
        "[onboarding] dashboard generation not started:",
        describeError(error).message,
      );
      return null;
    }
  }
}

export const onboardingWizardService = new OnboardingWizardService();
