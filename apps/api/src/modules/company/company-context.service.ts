import type { Prisma } from "../../../generated/prisma/client";
import type { CompanyContext } from "../../ai/company-context";
import { compileCompanyContext } from "../../ai/company-prompt";
import { prisma } from "../../db/prisma";
import { userService } from "../user/user.service";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The company profile as
// the one `<company-context>` block every AI call starts with: resolved from
// the user, the spreadsheet a cell runs in, or the current user, compiled by
// `compileCompanyContext` (ai/company-prompt.ts) and memoised per process by
// the company's `updatedAt` — every profile and document write moves it
// (company.service.ts `touchCompany`), so a hit is one indexed read.
//
// Also the home of the profile's bookkeeping columns — `contextHash` and the
// explicit Gemini cache (ai/gemini-cache.ts) — written WITHOUT moving
// `updatedAt`: they describe the context, they are not a change to it, and
// the `company_notify` trigger stays silent for them.

const contextSelect = {
  id: true,
  updatedAt: true,
  name: true,
  website: true,
  useCases: true,
  useCaseOther: true,
  summary: true,
  rules: true,
  contextHash: true,
  documents: {
    where: { status: "READY", digest: { not: null } },
    select: { name: true, digest: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} as const satisfies Prisma.CompanySelect;

export type GeminiCacheState = {
  name: string;
  /** What the cache was built from (ai/gemini-cache.ts `cacheKey`). */
  hash: string;
  expiresAt: Date;
};

export class CompanyContextService {
  private readonly memo = new Map<
    string,
    { at: number; context: CompanyContext | null }
  >();

  forUser(ownerId: string): Promise<CompanyContext | null> {
    return this.resolve({ ownerId });
  }

  /** The owner of the spreadsheet's workspace — what a cell, the assistant and a generation run under. */
  forSpreadsheet(spreadsheetId: string): Promise<CompanyContext | null> {
    return this.resolve({
      owner: {
        workspaces: { some: { spreadsheets: { some: { id: spreadsheetId } } } },
      },
    });
  }

  /** The signed-in user's (onboarding); null when there is no user yet. */
  async forCurrentUser(): Promise<CompanyContext | null> {
    const user = await userService.me().catch(() => null);
    return user ? this.forUser(user.id) : null;
  }

  private async resolve(
    where: Prisma.CompanyWhereInput,
  ): Promise<CompanyContext | null> {
    const head = await prisma.company.findFirst({
      where,
      select: { id: true, updatedAt: true },
    });
    if (!head) return null;
    const hit = this.memo.get(head.id);
    if (hit && hit.at === head.updatedAt.getTime()) return hit.context;

    const record = await prisma.company.findUnique({
      where: { id: head.id },
      select: contextSelect,
    });
    if (!record) return null;
    const context = compileCompanyContext({
      companyId: record.id,
      name: record.name,
      website: record.website,
      useCases: record.useCases,
      useCaseOther: record.useCaseOther,
      summary: record.summary,
      rules: record.rules,
      documents: record.documents.map((document) => ({
        name: document.name,
        digest: document.digest ?? "",
      })),
    });
    this.memo.set(record.id, { at: record.updatedAt.getTime(), context });
    const hash = context?.hash ?? null;
    if (hash !== record.contextHash) {
      await this.writeQuietly(record.id, { contextHash: hash });
    }
    return context;
  }

  async readGeminiCache(companyId: string): Promise<GeminiCacheState | null> {
    const record = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        geminiCacheName: true,
        geminiCacheHash: true,
        geminiCacheExpiresAt: true,
      },
    });
    if (
      !record?.geminiCacheName ||
      !record.geminiCacheHash ||
      !record.geminiCacheExpiresAt
    ) {
      return null;
    }
    return {
      name: record.geminiCacheName,
      hash: record.geminiCacheHash,
      expiresAt: record.geminiCacheExpiresAt,
    };
  }

  async writeGeminiCache(
    companyId: string,
    state: GeminiCacheState | null,
  ): Promise<void> {
    await this.writeQuietly(companyId, {
      geminiCacheName: state?.name ?? null,
      geminiCacheHash: state?.hash ?? null,
      geminiCacheExpiresAt: state?.expiresAt ?? null,
    });
  }

  /**
   * A write that keeps `updatedAt` as it is: Prisma only leaves an
   * `@updatedAt` column alone when it is set explicitly, so it is set to its
   * own value — and only if nobody moved it meanwhile. Losing that race is
   * fine: the next read recomputes.
   */
  private async writeQuietly(
    companyId: string,
    data: Prisma.CompanyUpdateManyMutationInput,
  ): Promise<void> {
    const current = await prisma.company.findUnique({
      where: { id: companyId },
      select: { updatedAt: true },
    });
    if (!current) return;
    await prisma.company.updateMany({
      where: { id: companyId, updatedAt: current.updatedAt },
      data: { ...data, updatedAt: current.updatedAt },
    });
  }
}

export const companyContextService = new CompanyContextService();
