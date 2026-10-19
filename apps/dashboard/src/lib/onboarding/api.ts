import type {
  RouterInputs,
  RouterOutputs,
} from "@reclit/api/trpc/routers/_app";
import { TRPCClientError } from "@trpc/client";
import type { ColumnType, NodeType } from "@/lib/ai-spreadsheet/types";
import { postFile } from "@/lib/api-fetch";

/**
 * The wizard's two REST calls and the error-code → message-key maps. The
 * routes are REST-only (multipart), so their responses are hand-declared
 * like `SheetImportResult`, with the tRPC pieces re-used where they exist;
 * dates are ISO strings (plain JSON). The contract lives in the header of
 * `apps/api/src/__tests__/onboarding.api.test.ts`.
 */
type Jsonified<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K];
};

type SuggestColumnsInput = RouterInputs["onboarding"]["suggestColumns"];

/** `POST /onboarding/describe`: the typed upload plus the model's description. */
export type OnboardingDescription = {
  suggestedName: string;
  description: string;
  purpose: string;
  columns: SuggestColumnsInput["columns"];
  sampleRows: SuggestColumnsInput["sampleRows"];
  rowCount: number;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
};

/** One extra column `POST /onboarding` creates beside the file's own. */
export type OnboardingColumn = {
  name: string;
  type: ColumnType;
  node: NodeType | null;
  prompt: string | null;
};

/** `POST /onboarding`: the new workspace, its sheet and every column. */
export type OnboardingResult = {
  user: Jsonified<RouterOutputs["user"]["me"]>;
  workspace: Jsonified<RouterOutputs["workspace"]["list"][number]>;
  spreadsheet: Jsonified<RouterOutputs["spreadsheet"]["byId"]>;
  import: { rowCount: number; cellCount: number; totalColumns: number };
  columns: RouterOutputs["spreadsheet"]["rows"]["columns"];
};

export type CreateWorkspaceFields = {
  name: string;
  description: string;
  purpose: string;
  columns: OnboardingColumn[];
};

/** Parses and describes `file`; nothing is written. */
export const describeSheet = (file: File) =>
  postFile<OnboardingDescription>("/onboarding/describe", file);

/** Creates the first workspace from `file`; a blank `name` means "use the file's". */
export const createWorkspace = (file: File, fields: CreateWorkspaceFields) =>
  postFile<OnboardingResult>("/onboarding", file, {
    name: fields.name,
    description: fields.description,
    purpose: fields.purpose,
    columns: JSON.stringify(fields.columns),
  });

/** The server's own default, mirrored to prefill the name field. */
const NAME_MAX = 200;

/** "Q3 leads.final.csv" → "Q3 leads.final". */
export function workspaceNameFromFile(filename: string): string {
  return filename
    .replace(/\.[^./\\]*$/, "")
    .trim()
    .slice(0, NAME_MAX);
}

export type OnboardingErrorKey =
  | "errorType"
  | "errorEmpty"
  | "errorTooLarge"
  | "errorName"
  | "errorColumnName"
  | "errorWidgets"
  | "errorConflict"
  | "errorRun"
  | "aiUnavailable"
  | "aiFailed"
  | "error";

/** An `ApiError.code` from the REST routes → its `onboarding.*` message key. */
export function onboardingErrorKey(code: string): OnboardingErrorKey {
  switch (code) {
    case "SPREADSHEET_IMPORT_UNSUPPORTED_TYPE":
      return "errorType";
    case "SPREADSHEET_IMPORT_EMPTY":
    case "SPREADSHEET_IMPORT_NO_HEADER":
      return "errorEmpty";
    case "SPREADSHEET_IMPORT_TOO_LARGE":
      return "errorTooLarge";
    case "VALIDATION_FAILED":
      return "errorName";
    case "SPREADSHEET_COLUMN_NAME_TAKEN":
      return "errorColumnName";
    case "ONBOARDING_AI_UNAVAILABLE":
      return "aiUnavailable";
    case "ONBOARDING_AI_FAILED":
      return "aiFailed";
    default:
      return "error";
  }
}

/** The tRPC error code of a failed mutation, or undefined for anything else. */
export function trpcCodeOf(error: unknown): string | undefined {
  return error instanceof TRPCClientError ? error.data?.code : undefined;
}

/** A tRPC error code from the wizard's procedures → its `onboarding.*` message key. */
export function trpcErrorKey(code: string | undefined): OnboardingErrorKey {
  switch (code) {
    case "SERVICE_UNAVAILABLE":
      return "aiUnavailable";
    case "BAD_GATEWAY":
      return "aiFailed";
    case "CONFLICT":
      return "errorConflict";
    case "BAD_REQUEST":
      return "errorWidgets";
    default:
      return "error";
  }
}
