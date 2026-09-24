import type { RouterOutputs } from "@reclit/api/trpc/routers/_app";
import { postFile } from "@/lib/api-fetch";

/**
 * The response of `POST /onboarding`. Hand-declared like `SheetImportResult`:
 * the endpoint is REST-only, so there is no `RouterOutputs` entry for it. Its
 * `user` and `workspace` are the tRPC shapes, with dates as ISO strings (plain
 * JSON). The contract lives in the header of
 * `apps/api/src/__tests__/onboarding.api.test.ts`.
 */
type Jsonified<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K];
};

export type OnboardingResult = {
  user: Jsonified<RouterOutputs["user"]["me"]>;
  workspace: Jsonified<RouterOutputs["workspace"]["list"][number]>;
  import: { rowCount: number; cellCount: number; totalColumns: number };
};

/** Creates the first workspace from `file`; a blank `name` means "use the file's". */
export const completeOnboarding = (file: File, name: string) =>
  postFile<OnboardingResult>("/onboarding", file, { name });

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
  | "error";

/** An `ApiError.code` from `POST /onboarding` → its `onboarding.*` message key. */
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
    default:
      return "error";
  }
}
