import { createHash } from "node:crypto";
import { describeError } from "../common/errors";
import {
  type CompanyContextService,
  companyContextService,
  type GeminiCacheState,
} from "../modules/company/company-context.service";
import { cachedCellSystem } from "./cell-prompt";
import type { CompanyContext } from "./company-context";
import { GEMINI_DEFAULT_MODEL } from "./gemini";

// Gemini's EXPLICIT cache for a batch of cells: the company block plus the
// cell preamble, stored once on Google's side and named in every cell call
// of the batch (`providerOptions.google.cachedContent`), so that prefix is
// billed at the cached rate. Raw REST rather than an SDK — one POST to
// create, one DELETE — in the house idiom of firecrawl.ts; the key is read
// per call. The implicit cache (a shared prefix, no setup) works without
// any of this; this only makes the discount certain where the volume is.
//
// Never fatal: below Gemini's minimum size, without a key, or on any error,
// `ensureCompanyCache` answers null and the batch runs on the implicit path.

export const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_CACHE_TTL_SECONDS = 3600;
/** A stored cache with less than this left is replaced rather than reused. */
export const GEMINI_CACHE_MIN_REMAINING_MS = 5 * 60_000;
/** Gemini refuses a smaller cache ("min_total_token_count=1024" on 2.5 Flash). */
export const GEMINI_CACHE_MIN_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 30_000;

/** A conservative estimate (Gemini counts ~3.5 characters per token of English). */
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

export type GeminiCacheStore = Pick<
  CompanyContextService,
  "readGeminiCache" | "writeGeminiCache"
>;

export type GeminiCacheDeps = {
  fetchImpl?: CacheFetch;
  now?: () => number;
  store?: GeminiCacheStore;
  model?: string;
};

function apiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  return key;
}

async function call(
  fetchImpl: CacheFetch,
  path: string,
  method: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${GEMINI_API_URL}/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey(),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Gemini ${method} ${path} failed: HTTP ${response.status} — ${text.slice(0, 200)}`,
    );
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** Creates a cache of `systemInstruction` for `model`; answers its name and expiry. */
export async function createCachedContent(
  model: string,
  systemInstruction: string,
  deps: Pick<GeminiCacheDeps, "fetchImpl" | "now"> = {},
): Promise<{ name: string; expiresAt: Date }> {
  const now = deps.now ?? Date.now;
  const body = await call(
    deps.fetchImpl ?? (fetch as unknown as CacheFetch),
    "cachedContents",
    "POST",
    {
      model: `models/${model}`,
      displayName: "reclit-company",
      systemInstruction: { parts: [{ text: systemInstruction }] },
      ttl: `${GEMINI_CACHE_TTL_SECONDS}s`,
    },
  );
  const name = typeof body.name === "string" ? body.name : null;
  if (!name) throw new Error("Gemini created a cache but returned no name");
  const expireTime =
    typeof body.expireTime === "string" ? Date.parse(body.expireTime) : NaN;
  return {
    name,
    expiresAt: new Date(
      Number.isFinite(expireTime)
        ? expireTime
        : now() + GEMINI_CACHE_TTL_SECONDS * 1000,
    ),
  };
}

/** Best effort: a cache left behind expires on its own within the TTL. */
export async function deleteCachedContent(
  name: string,
  deps: Pick<GeminiCacheDeps, "fetchImpl"> = {},
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
 * stores it on the company and deletes the one it replaces.
 */
export async function ensureCompanyCache(
  context: CompanyContext,
  deps: GeminiCacheDeps = {},
): Promise<string | null> {
  const store = deps.store ?? companyContextService;
  const now = deps.now ?? Date.now;
  const model = deps.model ?? GEMINI_DEFAULT_MODEL;
  const instruction = cachedCellSystem(context);
  if (estimateTokens(instruction) < GEMINI_CACHE_MIN_TOKENS) return null;
  const hash = cacheKey(model, instruction);
  try {
    const stored = await store.readGeminiCache(context.companyId);
    if (
      stored &&
      stored.hash === hash &&
      stored.expiresAt.getTime() - now() > GEMINI_CACHE_MIN_REMAINING_MS
    ) {
      return stored.name;
    }
    const created = await createCachedContent(model, instruction, deps);
    const state: GeminiCacheState = { ...created, hash };
    await store.writeGeminiCache(context.companyId, state);
    if (stored) await deleteCachedContent(stored.name, deps);
    return created.name;
  } catch (error) {
    console.warn(
      "[gemini-cache] no explicit cache, using the implicit path:",
      describeError(error).message,
    );
    return null;
  }
}
