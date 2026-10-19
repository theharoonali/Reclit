import { z } from "zod";
import { workspaceIdInput } from "../../common/schema";
import { assistantUsageSchema } from "../assistant/assistant.schema";
import { MAX_RUN_AI_BATCH_ROWS } from "../run-ai/run-ai.schema";
import {
  columnDraftInput,
  columnTypeWire,
  MAX_IMPORT_COLUMNS,
  MAX_SPREADSHEET_DESCRIPTION,
  MAX_SPREADSHEET_PURPOSE,
  sheetColumnSchema,
  spreadsheetMetaSchema,
} from "../spreadsheet/spreadsheet.schema";
import { userProfileSchema } from "../user/user.schema";
import {
  WORKSPACE_NAME_MAX,
  workspaceName,
  workspaceSummarySchema,
} from "../workspace/workspace.schema";

// Single source of truth for the onboarding wizard's shapes. The two REST
// routes take the file as the multipart `file` field; these are the text
// fields beside it and the tRPC procedures' inputs and outputs
// (docs/plans/033-ai-onboarding-wizard.md).

/** Extra columns one onboarding may create beside the file's own. */
export const ONBOARDING_MAX_COLUMNS = 10;
/** The rows the describe step shows the model and hands back to the client. */
export const ONBOARDING_SAMPLE_ROWS = 5;
/** The most AI columns one suggestion answers. */
export const MAX_SUGGESTED_COLUMNS = 5;
/** The types an AI column can be proposed with: what a per-row answer fits. */
export const ONBOARDING_AI_COLUMN_TYPES = [
  "string",
  "number",
  "boolean",
  "date",
] as const;

/** A blank multipart text field counts as absent. */
const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** The multipart `columns` field: a JSON array as text; absent or blank is none. */
const columnsFromJson = (value: unknown) => {
  if (value === undefined || value === null) return [];
  if (typeof value !== "string") return value;
  if (value.trim() === "") return [];
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/* ------------------------------------------------------- POST /onboarding */

export const onboardingInput = z.object({
  name: z.preprocess(blankToUndefined, workspaceName.optional()),
  description: z.preprocess(
    blankToUndefined,
    z.string().trim().max(MAX_SPREADSHEET_DESCRIPTION).optional(),
  ),
  purpose: z.preprocess(
    blankToUndefined,
    z.string().trim().max(MAX_SPREADSHEET_PURPOSE).optional(),
  ),
  columns: z.preprocess(
    columnsFromJson,
    z.array(columnDraftInput).max(ONBOARDING_MAX_COLUMNS),
  ),
});

export const onboardingResultSchema = z.object({
  /** Still `onboardingCompleted: false` — `onboarding.finish` sets it. */
  user: userProfileSchema,
  workspace: workspaceSummarySchema,
  spreadsheet: spreadsheetMetaSchema,
  import: z.object({
    rowCount: z.number().int(),
    cellCount: z.number().int(),
    totalColumns: z.number().int(),
  }),
  /** Every column of the new sheet: the file's first, the created ones after. */
  columns: z.array(sheetColumnSchema),
});

/* ---------------------------------------------- POST /onboarding/describe */

const describedColumnSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: columnTypeWire,
});

/** A row of the sample as text: one entry per column, blank for no cell. */
const sampleRowSchema = z.array(z.string().max(200));

/** The strict twin of the model's answer (`describeOutputSchema` is the lenient one). */
export const describedSheetSchema = z.object({
  suggestedName: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.slice(0, WORKSPACE_NAME_MAX)),
  description: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.slice(0, MAX_SPREADSHEET_DESCRIPTION)),
  purpose: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.slice(0, MAX_SPREADSHEET_PURPOSE)),
});

export const onboardingDescriptionSchema = describedSheetSchema.extend({
  columns: z.array(describedColumnSchema),
  sampleRows: z.array(sampleRowSchema).max(ONBOARDING_SAMPLE_ROWS),
  rowCount: z.number().int(),
  model: z.string(),
  usage: assistantUsageSchema,
});

/* ------------------------------------------------ onboarding.suggestColumns */

export const suggestColumnsInput = z.object({
  name: workspaceName,
  description: z.string().trim().max(MAX_SPREADSHEET_DESCRIPTION),
  purpose: z.string().trim().max(MAX_SPREADSHEET_PURPOSE),
  columns: z.array(describedColumnSchema).min(1).max(MAX_IMPORT_COLUMNS),
  sampleRows: z.array(sampleRowSchema).max(ONBOARDING_SAMPLE_ROWS),
});

/** One proposed AI column, parsed strictly from the model's loose answer. */
export const suggestedColumnSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(ONBOARDING_AI_COLUMN_TYPES),
  prompt: z.string().trim().min(1).max(10_000),
});

export const onboardingSuggestionsSchema = z.object({
  columns: z.array(suggestedColumnSchema).max(MAX_SUGGESTED_COLUMNS),
  /** The model could not propose anything useful; `question` says what it needs. */
  needsMoreContext: z.boolean(),
  question: z.string().max(500).nullable(),
  /** Proposals dropped by the strict parse, a taken name or the cap. */
  skipped: z.number().int(),
  model: z.string(),
  usage: assistantUsageSchema,
});

/* -------------------------------------------------------- onboarding.finish */

export const finishOnboardingInput = workspaceIdInput.extend({
  rowLimit: z
    .number()
    .int()
    .min(1)
    .max(MAX_RUN_AI_BATCH_ROWS)
    .default(MAX_RUN_AI_BATCH_ROWS),
});

export const onboardingFinishSchema = z.object({
  /** Now `onboardingCompleted: true`. */
  user: userProfileSchema,
  /** The run-ai batch, or null when the sheet has no runnable column or no row. */
  batchId: z.string().nullable(),
  cellCount: z.number().int(),
  rowCount: z.number().int(),
  columnCount: z.number().int(),
});

export type OnboardingInput = z.infer<typeof onboardingInput>;
export type OnboardingResult = z.infer<typeof onboardingResultSchema>;
export type DescribedSheet = z.infer<typeof describedSheetSchema>;
export type OnboardingDescription = z.infer<typeof onboardingDescriptionSchema>;
export type SuggestColumnsInput = z.infer<typeof suggestColumnsInput>;
export type SuggestedColumn = z.infer<typeof suggestedColumnSchema>;
export type OnboardingSuggestions = z.infer<typeof onboardingSuggestionsSchema>;
export type FinishOnboardingInput = z.infer<typeof finishOnboardingInput>;
export type OnboardingFinish = z.infer<typeof onboardingFinishSchema>;

const FALLBACK_NAME = "My workspace";

/** "Q3 leads.final.csv" → "Q3 leads.final"; a nameless file gets a fallback. */
export function workspaceNameFromFile(filename: string): string {
  const base = filename.replace(/\.[^./\\]*$/, "").trim();
  return (base || FALLBACK_NAME).slice(0, WORKSPACE_NAME_MAX);
}
