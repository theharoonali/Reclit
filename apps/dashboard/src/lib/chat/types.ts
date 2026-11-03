/**
 * The chat screen's local shapes. The chat has no API yet, so these are the
 * fixture types the UI renders from; the integration step replaces them with
 * `RouterOutputs` once a `chat` router exists.
 */
export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

/** Model names are product names (data), not copy — deliberately not translated. */
export const CHAT_MODELS = ["Reclit Pro", "Reclit Fast"] as const;

export type ChatModel = (typeof CHAT_MODELS)[number];

/** How long the fixture "thinks" before its canned reply appears. */
export const FIXTURE_REPLY_MS = 900;
