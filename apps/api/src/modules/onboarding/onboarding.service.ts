import {
  type DescribeGeneration,
  type DescribeGenerator,
  generateSheetDescription,
} from "../../ai/onboarding-ai";
import { buildDescribePrompt, toSampleRows } from "../../ai/onboarding-prompt";
import { describeError } from "../../common/errors";
import { prisma } from "../../db/prisma";
import type { ColumnDraftInput } from "../spreadsheet/spreadsheet.schema";
import { spreadsheetService } from "../spreadsheet/spreadsheet.service";
import { toSheetColumn } from "../spreadsheet/spreadsheet.shape";
import { spreadsheetColumnsService } from "../spreadsheet/spreadsheet-columns.service";
import { spreadsheetImportService } from "../spreadsheet/spreadsheet-import.service";
import { userService } from "../user/user.service";
import { workspaceService } from "../workspace/workspace.service";
import {
  OnboardingAiFailedError,
  OnboardingAiUnavailableError,
  OnboardingAlreadyCompletedError,
} from "./onboarding.errors";
import {
  describedSheetSchema,
  ONBOARDING_SAMPLE_ROWS,
  type OnboardingDescription,
  type OnboardingInput,
  type OnboardingResult,
  workspaceNameFromFile,
} from "./onboarding.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1), and the REST half of the
// wizard: both methods take the upload, so both need the parsers — which is
// why this file never enters the tRPC graph (onboarding-wizard.service.ts is
// the half the router imports). `describe` reads the file and asks the model
// once, writing nothing; `create` turns the file into the user's first
// workspace. The flag is set by `finish`, not here
// (docs/plans/033-ai-onboarding-wizard.md).

export type DescribeDeps = { generate: DescribeGenerator };

export class OnboardingService {
  /**
   * The upload parsed and typed exactly like an import, then described by the
   * model: a workspace name, a description and a label — plus the columns and
   * the first rows the client hands back to `onboarding.suggestColumns`.
   */
  async describe(
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
    deps: DescribeDeps = { generate: generateSheetDescription },
  ): Promise<OnboardingDescription> {
    const plan = await spreadsheetImportService.parse(
      bytes,
      filename,
      mimeType,
    );
    // `gemini()` would throw a plain Error; name the condition instead.
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new OnboardingAiUnavailableError();
    }
    const sampleRows = toSampleRows(
      plan.cells,
      plan.columns.length,
      ONBOARDING_SAMPLE_ROWS,
    );
    const messages = buildDescribePrompt({
      filename,
      rowCount: plan.cells.length,
      columns: plan.columns,
      sampleRows,
    });
    let generated: DescribeGeneration;
    try {
      generated = await deps.generate(messages);
    } catch (error) {
      throw new OnboardingAiFailedError(describeError(error).message);
    }
    const described = describedSheetSchema.safeParse(generated.described);
    if (!described.success) {
      throw new OnboardingAiFailedError("the model answered nothing usable");
    }
    return {
      ...described.data,
      columns: plan.columns,
      sampleRows,
      rowCount: plan.cells.length,
      model: generated.model,
      usage: generated.usage,
    };
  }

  /**
   * The workspace, its sheet from the file, the extra columns and the sheet's
   * description. The file is parsed before anything is written, so a bad file
   * leaves no trace; a failure after the workspace exists removes it again.
   */
  async create(
    input: OnboardingInput,
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<OnboardingResult> {
    const me = await userService.me();
    if (me.onboardingCompleted) throw new OnboardingAlreadyCompletedError();

    const plan = await spreadsheetImportService.parse(
      bytes,
      filename,
      mimeType,
    );

    // workspaceService.create owns "a workspace always has its sheet"; the
    // writes after it are separate transactions, so a failure there removes
    // the workspace again (FK cascade takes the sheet). Not
    // workspaceService.remove: its last-workspace guard would refuse exactly
    // this delete.
    const workspace = await workspaceService.create({
      name: input.name ?? workspaceNameFromFile(filename),
    });
    try {
      const sheetId = workspace.spreadsheetId;
      if (!sheetId) {
        throw new Error("workspace.create returned no spreadsheetId");
      }
      const imported = await spreadsheetImportService.replaceAll(sheetId, plan);
      await this.addColumns(sheetId, input.columns);
      const spreadsheet = await spreadsheetService.updateMeta({
        id: sheetId,
        description: input.description ?? null,
        purpose: input.purpose ?? null,
      });
      const columns = (await spreadsheetService.columnsOf(sheetId)).map(
        toSheetColumn,
      );
      return {
        user: me,
        workspace,
        spreadsheet,
        import: {
          rowCount: imported.rowCount,
          cellCount: imported.cellCount,
          totalColumns: imported.columns.length,
        },
        columns,
      };
    } catch (error) {
      await prisma.workspace.delete({ where: { id: workspace.id } });
      throw error;
    }
  }

  /** One `createColumn` per draft, in order, so each takes the next `sortOrder`. */
  private async addColumns(
    sheetId: string,
    columns: ColumnDraftInput[],
  ): Promise<void> {
    for (const column of columns) {
      await spreadsheetColumnsService.createColumn({ id: sheetId, ...column });
    }
  }
}

export const onboardingService = new OnboardingService();
