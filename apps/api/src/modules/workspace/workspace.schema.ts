import { z } from "zod";
import { idInput } from "../../common/schema";

// Single source of truth for the workspace shapes. A workspace's sheets share
// its name by design (docs/plans/013-workspaces.md), so the name rule mirrors
// the spreadsheet's.

const name = z.string().trim().min(1, "Name is required").max(200);

export const createWorkspaceInput = z.object({ name });
export const renameWorkspaceInput = idInput.extend({ name });

/**
 * `spreadsheetId` is the workspace's sheet (first by createdAt), derived here
 * so the frontend never needs a second lookup. Nullable: `spreadsheet.remove`
 * can leave a workspace without one.
 */
export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  spreadsheetId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInput>;
export type RenameWorkspaceInput = z.infer<typeof renameWorkspaceInput>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
