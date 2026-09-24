import { prisma } from "../../db/prisma";
import { spreadsheetImportService } from "../spreadsheet/spreadsheet-import.service";
import { userService } from "../user/user.service";
import { workspaceService } from "../workspace/workspace.service";
import { OnboardingAlreadyCompletedError } from "./onboarding.errors";
import type { OnboardingInput, OnboardingResult } from "./onboarding.schema";
import { workspaceNameFromFile } from "./onboarding.schema";

// Framework-free (docs/rules/BACKEND.md hard rule 1). Onboarding turns one
// upload into the user's first workspace: the file is parsed before anything
// is written, so a bad file leaves no trace (docs/plans/027-onboarding.md).

export class OnboardingService {
  async complete(
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
    // grid write is a second transaction, so a failure there removes the
    // workspace again (FK cascade takes the sheet). Not workspaceService.remove:
    // its last-workspace guard would refuse exactly this delete.
    const workspace = await workspaceService.create({
      name: input.name ?? workspaceNameFromFile(filename),
    });
    let imported: Awaited<
      ReturnType<typeof spreadsheetImportService.replaceAll>
    >;
    try {
      if (!workspace.spreadsheetId) {
        throw new Error("workspace.create returned no spreadsheetId");
      }
      imported = await spreadsheetImportService.replaceAll(
        workspace.spreadsheetId,
        plan,
      );
    } catch (error) {
      await prisma.workspace.delete({ where: { id: workspace.id } });
      throw error;
    }

    const user = await userService.completeOnboarding();
    return {
      user,
      workspace,
      import: {
        rowCount: imported.rowCount,
        cellCount: imported.cellCount,
        totalColumns: imported.columns.length,
      },
    };
  }
}

export const onboardingService = new OnboardingService();
