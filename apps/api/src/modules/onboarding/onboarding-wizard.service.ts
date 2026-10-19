import {
  generateColumnSuggestions,
  type SuggestGeneration,
  type SuggestGenerator,
} from "../../ai/onboarding-ai";
import { buildSuggestColumnsPrompt } from "../../ai/onboarding-prompt";
import { describeError } from "../../common/errors";
import { readAllRows } from "../assistant/assistant-context";
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
  type OnboardingSuggestions,
  type SuggestColumnsInput,
  type SuggestedColumn,
  suggestedColumnSchema,
} from "./onboarding.schema";

// The tRPC half of the wizard, parser-free: `suggestColumns` works from the
// parse summary `describe` handed the client (no file, nothing read), and
// `finish` runs the new sheet's AI columns and sets the flag. Prisma-free
// too — every read and write goes through the other features' services. The
// generator is injectable so the contract test covers the filtering without
// a key (assistant-recommend.service.ts is the template).

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
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new OnboardingAiUnavailableError();
    }
    const messages = buildSuggestColumnsPrompt(input, MAX_SUGGESTED_COLUMNS);
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
   * The last step: every runnable column of the workspace's sheet over its
   * first stored rows (within `rowLimit` and the batch's cell cap) as one
   * run-ai batch, then the flag. A dispatch failure propagates with the flag
   * still false, so the step can be retried.
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
    return {
      user,
      batchId: runs[0]?.batchId ?? null,
      cellCount: runs.length,
      rowCount: rowIndexes.length,
      columnCount: columns.length,
    };
  }
}

export const onboardingWizardService = new OnboardingWizardService();
