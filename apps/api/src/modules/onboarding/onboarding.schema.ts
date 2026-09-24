import { z } from "zod";
import { userProfileSchema } from "../user/user.schema";
import {
  WORKSPACE_NAME_MAX,
  workspaceName,
  workspaceSummarySchema,
} from "../workspace/workspace.schema";

// Single source of truth for the onboarding shapes. The file itself arrives as
// the multipart `file` field; these are the text fields beside it.

/** A blank `name` field counts as absent: the file name is used instead. */
export const onboardingInput = z.object({
  name: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    workspaceName.optional(),
  ),
});

export const onboardingResultSchema = z.object({
  user: userProfileSchema,
  workspace: workspaceSummarySchema,
  import: z.object({
    rowCount: z.number().int(),
    cellCount: z.number().int(),
    totalColumns: z.number().int(),
  }),
});

export type OnboardingInput = z.infer<typeof onboardingInput>;
export type OnboardingResult = z.infer<typeof onboardingResultSchema>;

const FALLBACK_NAME = "My workspace";

/** "Q3 leads.final.csv" → "Q3 leads.final"; a nameless file gets a fallback. */
export function workspaceNameFromFile(filename: string): string {
  const base = filename.replace(/\.[^./\\]*$/, "").trim();
  return (base || FALLBACK_NAME).slice(0, WORKSPACE_NAME_MAX);
}
