import type { Prisma } from "../../../generated/prisma/client";
import type { CompanyContext } from "../../ai/company-context";
import { compileCompanyContext } from "../../ai/company-prompt";
import { prisma } from "../../db/prisma";
import { userService } from "../user/user.service";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The company profile as
// the one `<company-context>` block every AI call starts with: resolved from
// the user, the spreadsheet a cell runs in, or the current user, compiled by
// `compileCompanyContext` (ai/company-prompt.ts) and memoised per process by
// the user's `companyUpdatedAt` — every profile and document write moves it
// (company.service.ts `companyData` / `touchCompany`), so a hit is one
// indexed read.
//
// Also the home of the profile's bookkeeping columns — `contextHash` and the
// explicit prompt cache (ai/prompt-cache.ts) — written WITHOUT moving
// `companyUpdatedAt` or `updatedAt`: they describe the context, they are not
// a change to it, and the `company_changed` trigger stays silent for them.

const contextSelect = {
  id: true,
  companyUpdatedAt: true,
  companyName: true,
  companyWebsite: true,
  useCases: true,
  useCaseOther: true,
  companySummary: true,
  companyRules: true,
  contextHash: true,
  companyDocuments: {
    where: { status: "READY", digest: { not: null } },
    select: { name: true, digest: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} as const satisfies Prisma.UserSelect;

export type PromptCacheState = {
  name: string;
  /** What the cache was built from (ai/prompt-cache.ts `cacheKey`). */
  hash: string;
  expiresAt: Date;
};

export class CompanyContextService {
  private readonly memo = new Map<
    string,
    { at: number; context: CompanyContext | null }
  >();

  forUser(userId: string): Promise<CompanyContext | null> {
    return this.resolve({ id: userId });
  }

  /** The owner of the spreadsheet's workspace — what a cell, the assistant and a generation run under. */
  forSpreadsheet(spreadsheetId: string): Promise<CompanyContext | null> {
    return this.resolve({
      workspaces: { some: { spreadsheets: { some: { id: spreadsheetId } } } },
    });
  }

  /** The signed-in user's (onboarding); null when there is no user yet. */
  async forCurrentUser(): Promise<CompanyContext | null> {
    const user = await userService.me().catch(() => null);
    return user ? this.forUser(user.id) : null;
  }

  private async resolve(
    where: Prisma.UserWhereInput,
  ): Promise<CompanyContext | null> {
    const head = await prisma.user.findFirst({
      where,
      select: { id: true, companyUpdatedAt: true },
    });
    if (!head) return null;
    const hit = this.memo.get(head.id);
    if (hit && hit.at === head.companyUpdatedAt.getTime()) return hit.context;

    const record = await prisma.user.findUnique({
      where: { id: head.id },
      select: contextSelect,
    });
    if (!record) return null;
    const context = compileCompanyContext({
      companyId: record.id,
      name: record.companyName,
      website: record.companyWebsite,
      useCases: record.useCases,
      useCaseOther: record.useCaseOther,
      summary: record.companySummary,
      rules: record.companyRules,
      documents: record.companyDocuments.map((document) => ({
        name: document.name,
        digest: document.digest ?? "",
      })),
    });
    this.memo.set(record.id, {
      at: record.companyUpdatedAt.getTime(),
      context,
    });
    const hash = context?.hash ?? null;
    if (hash !== record.contextHash) {
      await this.writeQuietly(record.id, { contextHash: hash });
    }
    return context;
  }

  async readPromptCache(companyId: string): Promise<PromptCacheState | null> {
    const record = await prisma.user.findUnique({
      where: { id: companyId },
      select: {
        promptCacheName: true,
        promptCacheHash: true,
        promptCacheExpiresAt: true,
      },
    });
    if (
      !record?.promptCacheName ||
      !record.promptCacheHash ||
      !record.promptCacheExpiresAt
    ) {
      return null;
    }
    return {
      name: record.promptCacheName,
      hash: record.promptCacheHash,
      expiresAt: record.promptCacheExpiresAt,
    };
  }

  async writePromptCache(
    companyId: string,
    state: PromptCacheState | null,
  ): Promise<void> {
    await this.writeQuietly(companyId, {
      promptCacheName: state?.name ?? null,
      promptCacheHash: state?.hash ?? null,
      promptCacheExpiresAt: state?.expiresAt ?? null,
    });
  }

  /**
   * A write that keeps the profile unchanged: `companyUpdatedAt` is left
   * alone, and `updatedAt` — which Prisma only leaves alone when it is set
   * explicitly — is set to its own value. Guarded on `companyUpdatedAt`, so a
   * profile edit in between wins; losing that race is fine: the next read
   * recomputes.
   */
  private async writeQuietly(
    companyId: string,
    data: Prisma.UserUpdateManyMutationInput,
  ): Promise<void> {
    const current = await prisma.user.findUnique({
      where: { id: companyId },
      select: { updatedAt: true, companyUpdatedAt: true },
    });
    if (!current) return;
    await prisma.user.updateMany({
      where: { id: companyId, companyUpdatedAt: current.companyUpdatedAt },
      data: { ...data, updatedAt: current.updatedAt },
    });
  }
}

export const companyContextService = new CompanyContextService();
