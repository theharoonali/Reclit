import { createGoogleGenerativeAI } from "@ai-sdk/google";

// The one Gemini provider for the Vercel AI SDK, framework-free. Created
// lazily (same idiom as the Supabase client in modules/file/file.service.ts)
// so the API and the test suite boot without the key; the first call without
// it fails with a clear message instead of an upstream 401.

export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

let provider: ReturnType<typeof createGoogleGenerativeAI> | undefined;

/** A Gemini language model for `generateText({ model })` and friends. */
export function gemini(modelId: string = GEMINI_DEFAULT_MODEL) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is not set. Add it to apps/api/.env (see .env.example).",
    );
  }
  provider ??= createGoogleGenerativeAI({ apiKey });
  return provider(modelId);
}
