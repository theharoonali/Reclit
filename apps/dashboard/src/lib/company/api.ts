import type {
  RouterInputs,
  RouterOutputs,
} from "@reclit/api/trpc/routers/_app";

/**
 * The company profile's wire shapes and the error → message-key map. The
 * contract lives in the header of `apps/api/src/__tests__/company.api.test.ts`.
 */
export type Company = RouterOutputs["company"]["me"];

/** Oldest first in `company.documents`. */
export type CompanyDocument = Company["documents"][number];

/** `company.update`'s payload: every field optional, `null` clears. */
export type CompanyUpdate = RouterInputs["company"]["update"];

export type UseCase = Company["useCases"][number];

export type CompanyCrawlStatus = Company["crawlStatus"];

export type CompanyDocumentStatus = CompanyDocument["status"];

/** The contract's payload limits, mirrored for `maxLength`. */
export const COMPANY_LIMITS = {
  useCaseOther: 200,
  summary: 4000,
  rules: 8000,
  website: 2048,
} as const;

export type CompanyErrorKey =
  | "websiteInvalid"
  | "scrapeFailed"
  | "aiUnavailable"
  | "websiteMissing"
  | "documentType"
  | "documentTooLarge"
  | "documentLimit"
  | "documentNotFound"
  | "uploadFailed"
  | "validation"
  | "error";

/** The company mutations — each maps its own error codes. */
export type CompanyProcedure =
  | "update"
  | "setWebsite"
  | "recrawl"
  | "addDocument"
  | "removeDocument";

/**
 * The tRPC code a company `procedure` failed with → its `company.errors.*`
 * key. Only the tRPC code reaches the client (not the `COMPANY_*` domain
 * code), so the procedure decides what it means: `BAD_REQUEST` is a bad
 * address on `setWebsite` but a refused file on `addDocument` (the size and
 * type are checked before upload, so the type is what is left). A code the
 * procedure does not name is the generic error.
 */
export function companyErrorKey(
  procedure: CompanyProcedure,
  code: string | undefined,
): CompanyErrorKey {
  switch (procedure) {
    case "update":
      return code === "BAD_REQUEST" ? "validation" : "error";
    case "setWebsite":
      if (code === "BAD_REQUEST") return "websiteInvalid";
      if (code === "SERVICE_UNAVAILABLE") return "aiUnavailable";
      if (code === "BAD_GATEWAY") return "scrapeFailed";
      return "error";
    case "recrawl":
      return code === "CONFLICT" ? "websiteMissing" : "error";
    case "addDocument":
      if (code === "CONFLICT") return "documentLimit";
      if (code === "BAD_REQUEST") return "documentType";
      return "error";
    case "removeDocument":
      return code === "NOT_FOUND" ? "documentNotFound" : "error";
  }
}
