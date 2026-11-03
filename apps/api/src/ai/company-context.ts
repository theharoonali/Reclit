// The compiled company profile as every prompt builder takes it, and the one
// way it enters a system prompt: FIRST. Gemini's implicit cache hits on a
// shared prefix, so the block — byte-identical for every call of one
// profile version — must come before anything call-specific. Pure: the
// block is compiled by `compileCompanyContext` (company-prompt.ts) and
// fetched by `companyContextService` (modules/company/).

export type CompanyContext = {
  companyId: string;
  /** The whole `<company-context>` block. */
  text: string;
  /** sha256 of `text`, hex. */
  hash: string;
};

/** `system` with the company block in front, or `system` alone without a profile. */
export function withCompanyContext(
  system: string,
  context: CompanyContext | null | undefined,
): string {
  return context ? `${context.text}\n\n${system}` : system;
}
