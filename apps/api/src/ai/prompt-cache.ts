import { createHash } from "node:crypto";
import { describeError } from "../common/errors";
import {
  type CompanyContextService,
  companyContextService,
  type PromptCacheState,
} from "../modules/company/company-context.service";
import { cachedCellSystem } from "./cell-prompt";
import type { CompanyContext } from "./company-context";
import { defaultModelId, promptCacheApi } from "./model";

// The model's EXPLICIT prompt cache for a batch of cells: the company block
// plus the cell preamble, stored once on the provider's side and named in
// every cell call of the batch (`cachedContentOptions`, ai/model.ts), so that
// prefix is billed at the cached rate. Raw REST rather than an SDK — one POST
// to create, one DELETE — in the house idiom of firecrawl.ts; the endpoint
// and key come from ai/model.ts per call. The implicit cache (a shared prefix,
// no setup) works without any of this; this only makes the discount certain
// where the volume is.
//
// Never fatal: below the provider's minimum size, without a key, or on any
// error, `ensureCompanyCache` answers null and the batch runs on the implicit
// path.

export const PROMPT_CACHE_TTL_SECONDS = 3600;
/** A stored cache with less than this left is replaced rather than reused. */
export const PROMPT_CACHE_MIN_REMAINING_MS = 5 * 60_000;
/** The provider refuses a smaller cache. */
export const PROMPT_CACHE_MIN_TOKENS = promptCacheApi.minTokens;
const REQUEST_TIMEOUT_MS = 30_000;

/** A conservative estimate (~3.5 characters per token of English). */
export const estimateTokens = (text: string): number =>
  Math.ceil(text.length / 4);

/** What a cache was built from: the model and the exact instruction. */
export const cacheKey = (model: string, systemInstruction: string): string =>
  createHash("sha256").update(`${model}\n${systemInstruction}`).digest("hex");

export type CacheFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type PromptCacheStore = Pick<
  CompanyContextService,
  "readPromptCache" | "writePromptCache"
>;

export type PromptCacheDeps = {
  fetchImpl?: CacheFetch;
  now?: () => number;
  store?: PromptCacheStore;
  model?: string;
};

async function call(
  fetchImpl: CacheFetch,
  path: string,
  method: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${promptCacheApi.url}/${path}`, {
    method,
    headers: promptCacheApi.headers(),
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Prompt cache ${method} ${path} failed: HTTP ${response.status} — ${text.slice(0, 200)}`,
    );
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** Creates a cache of `systemInstruction` for `model`; answers its name and expiry. */
export async function createCachedContent(
  model: string,
  systemInstruction: string,
  deps: Pick<PromptCacheDeps, "fetchImpl" | "now"> = {},
): Promise<{ name: string; expiresAt: Date }> {
  const now = deps.now ?? Date.now;
  const body = await call(
    deps.fetchImpl ?? (fetch as unknown as CacheFetch),
    "cachedContents",
    "POST",
    {
      model: promptCacheApi.modelPath(model),
      displayName: "reclit-company",
      systemInstruction: { parts: [{ text: systemInstruction }] },
      ttl: `${PROMPT_CACHE_TTL_SECONDS}s`,
    },
  );
  const name = typeof body.name === "string" ? body.name : null;
  if (!name)
    throw new Error("The provider created a cache but returned no name");
  const expireTime =
    typeof body.expireTime === "string" ? Date.parse(body.expireTime) : NaN;
  return {
    name,
    expiresAt: new Date(
      Number.isFinite(expireTime)
        ? expireTime
        : now() + PROMPT_CACHE_TTL_SECONDS * 1000,
    ),
  };
}

/** Best effort: a cache left behind expires on its own within the TTL. */
export async function deleteCachedContent(
  name: string,
  deps: Pick<PromptCacheDeps, "fetchImpl"> = {},
): Promise<void> {
  await call(
    deps.fetchImpl ?? (fetch as unknown as CacheFetch),
    name,
    "DELETE",
  ).catch(() => undefined);
}

/**
 * The cache a batch of cells should run on, or null for the implicit path.
 * Reuses the stored one when it was built from the same model and
 * instruction and has more than five minutes left; otherwise creates one,
 * stores it on the profile and deletes the one it replaces.
 */
export async function ensureCompanyCache(
  context: CompanyContext,
  deps: PromptCacheDeps = {},
): Promise<string | null> {
  const store = deps.store ?? companyContextService;
  const now = deps.now ?? Date.now;
  const model = deps.model ?? defaultModelId();
  const instruction = cachedCellSystem(context);
  if (estimateTokens(instruction) < PROMPT_CACHE_MIN_TOKENS) return null;
  const hash = cacheKey(model, instruction);
  try {
    const stored = await store.readPromptCache(context.companyId);
    if (
      stored &&
      stored.hash === hash &&
      stored.expiresAt.getTime() - now() > PROMPT_CACHE_MIN_REMAINING_MS
    ) {
      return stored.name;
    }
    const created = await createCachedContent(model, instruction, deps);
    const state: PromptCacheState = { ...created, hash };
    await store.writePromptCache(context.companyId, state);
    if (stored) await deleteCachedContent(stored.name, deps);
    return created.name;
  } catch (error) {
    console.warn(
      "[prompt-cache] no explicit cache, using the implicit path:",
      describeError(error).message,
    );
    return null;
  }
}
