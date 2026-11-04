import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProviderMetadata,
  google,
} from "@ai-sdk/google";
import type { ProviderMetadata } from "ai";

// The one AI provider for the Vercel AI SDK, framework-free — and the ONLY
// file that knows which vendor that is. Everything else in the codebase
// speaks of "the model": swapping providers means rewriting this file (and
// the REST shape of ai/prompt-cache.ts, which reads its constants from here).
// Created lazily (same idiom as the Supabase client in
// modules/file/file.service.ts) so the API and the test suite boot without
// the key; the first call without it fails with a clear message instead of an
// upstream 401.

/**
 * Where the key is read from, in order: `AI_API_KEY`, then the provider
 * SDK's own variable, so an environment set up before the rename still works.
 */
export const AI_KEY_ENV = [
  "AI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

/** The model every call uses unless `AI_MODEL` (or a caller) names another. */
const PROVIDER_DEFAULT_MODEL = "gemini-3.8-flash";

/** The API key, or undefined when none is set. */
export function aiApiKey(): string | undefined {
  for (const name of AI_KEY_ENV) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

/** Whether a model call can be made at all — what the 503 guards check. */
export const isAiConfigured = (): boolean => aiApiKey() !== undefined;

/** `AI_MODEL` from the environment, else the provider's default model. */
export const defaultModelId = (): string =>
  process.env.AI_MODEL || PROVIDER_DEFAULT_MODEL;

let provider: ReturnType<typeof createGoogleGenerativeAI> | undefined;

/** A language model for `generateText({ model })` and friends. */
export function aiModel(modelId: string = defaultModelId()) {
  const apiKey = aiApiKey();
  if (!apiKey) {
    throw new Error(
      "AI_API_KEY is not set. Add it to apps/api/.env (see .env.example).",
    );
  }
  provider ??= createGoogleGenerativeAI({ apiKey });
  return provider(modelId);
}

/**
 * The provider's web-search tool, keyed by the name the provider requires.
 * The descriptor is static, so building it needs no API key — only the model
 * call does.
 */
export const webSearchTools = () => ({
  google_search: google.tools.googleSearch({}),
});

/** The queries the model searched for, from a grounded call's provider metadata. */
export function webSearchQueries(
  providerMetadata: ProviderMetadata | undefined,
): string[] {
  const metadata = providerMetadata?.google as
    | GoogleGenerativeAIProviderMetadata
    | undefined;
  return metadata?.groundingMetadata?.webSearchQueries ?? [];
}

/** The provider options that run a call on an explicit prompt cache. */
export const cachedContentOptions = (cacheName: string) => ({
  google: { cachedContent: cacheName },
});

/** What the explicit prompt cache's REST calls (ai/prompt-cache.ts) need from the provider. */
export const promptCacheApi = {
  url: "https://generativelanguage.googleapis.com/v1beta",
  /** The request headers; throws without a key. */
  headers(): Record<string, string> {
    const apiKey = aiApiKey();
    if (!apiKey) throw new Error("AI_API_KEY is not set");
    return { "Content-Type": "application/json", "x-goog-api-key": apiKey };
  },
  /** A model id as the cache endpoint names it. */
  modelPath: (modelId: string) => `models/${modelId}`,
  /** The provider refuses a smaller cache (1024 tokens on the default model). */
  minTokens: 1024,
};
