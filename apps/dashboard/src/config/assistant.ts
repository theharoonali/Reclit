/**
 * The assistant island's configuration: which pages it serves, and its
 * timings and limits. The copy lives in `messages/en.json` (`assistant.*`).
 */

export type AssistantScope = "dashboard" | "spreadsheet";

/**
 * The scope the island runs in for a pathname, or `null` where it is hidden.
 * The dashboard and the sheet each get their own tool set server-side, so the
 * route decides the scope — never the user.
 */
export function scopeForPath(pathname: string): AssistantScope | null {
  if (pathname === "/") return "dashboard";
  if (pathname === "/ai-spreadsheet") return "spreadsheet";
  return null;
}

/** The API's prompt cap (`assistant.start`), refused in the field. */
export const ASSISTANT_PROMPT_MAX = 2000;

/** How long a finished run stays in the capsule before it collapses. */
export const RESULT_DONE_MS = 8_000;
export const RESULT_CANCELLED_MS = 4_000;
/** A failed run stays until dismissed. */

/** Voice input: a recording stops itself at this length… */
export const VOICE_MAX_MS = 60_000;
/** …and the upload cap of `POST /assistant/transcribe`, refused before sending. */
export const VOICE_MAX_BYTES = 10 * 1024 * 1024;
