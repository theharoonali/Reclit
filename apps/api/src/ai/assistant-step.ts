import {
  generateText,
  type JSONValue,
  type LanguageModelUsage,
  type ModelMessage,
  type ToolSet,
  tool,
} from "ai";
import {
  type AssistantUsage,
  MAX_ASSISTANT_TRANSCRIPT_BYTES,
} from "../modules/assistant/assistant.schema";
import type { AssistantToolSpec } from "../modules/assistant/assistant-tools";
import { GEMINI_DEFAULT_MODEL, gemini } from "./gemini";

// The assistant's one model call per step. The tools are declared without
// `execute`, so the SDK hands the calls back instead of running them: the
// task executes them one at a time (persisting each, asking the user before a
// delete, checking for a cancel), appends the results, and calls again. No
// `output` schema: Gemini rejects tools and a JSON response schema in one
// request (search-output.ts).

/** `ASSISTANT_MODEL` in the worker's environment overrides the default Gemini model. */
export const assistantModelId = (): string =>
  process.env.ASSISTANT_MODEL || GEMINI_DEFAULT_MODEL;

export type AssistantToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type AssistantStepResult = {
  model: string;
  usage: AssistantUsage;
  /** The assistant message(s) to append before the tool results. */
  responseMessages: ModelMessage[];
} & (
  | { kind: "text"; text: string }
  | { kind: "tools"; calls: AssistantToolCall[] }
);

/** The scope's tool table as the SDK's tool set — descriptions and input schemas only. */
export function toToolSet(specs: Record<string, AssistantToolSpec>): ToolSet {
  return Object.fromEntries(
    Object.entries(specs).map(([name, spec]) => [
      name,
      tool({ description: spec.description, inputSchema: spec.inputSchema }),
    ]),
  );
}

export const toUsage = (usage: LanguageModelUsage): AssistantUsage => ({
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  totalTokens:
    usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
});

export const addUsage = (
  a: AssistantUsage,
  b: AssistantUsage,
): AssistantUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
});

export async function runAssistantStep({
  system,
  messages,
  tools,
  abortSignal,
}: {
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
  abortSignal?: AbortSignal;
}): Promise<AssistantStepResult> {
  const modelId = assistantModelId();
  const result = await generateText({
    model: gemini(modelId),
    system,
    messages,
    tools,
    abortSignal,
  });
  const base = {
    model: result.response.modelId || modelId,
    usage: toUsage(result.usage),
    responseMessages: result.response.messages,
  };
  if (result.toolCalls.length === 0) {
    return { ...base, kind: "text", text: result.text };
  }
  return {
    ...base,
    kind: "tools",
    calls: result.toolCalls.map((call) => ({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
    })),
  };
}

/** Anything a handler produced, as the JSON the tool result carries. */
const toJsonValue = (value: unknown): JSONValue =>
  JSON.parse(JSON.stringify(value ?? null)) as JSONValue;

/**
 * The stored conversation stays under its cap: the oldest tool outputs are
 * blanked first, then the oldest messages dropped. Audit only — the loop
 * keeps the full messages in memory.
 */
export function trimTranscript(
  messages: ModelMessage[],
  maxBytes = MAX_ASSISTANT_TRANSCRIPT_BYTES,
): ModelMessage[] {
  const size = (value: unknown) => JSON.stringify(value).length;
  const copy: ModelMessage[] = structuredClone(messages);
  for (const message of copy) {
    if (size(copy) <= maxBytes) return copy;
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type === "tool-result") {
        part.output = { type: "text", value: "[truncated]" };
      }
    }
  }
  while (copy.length > 1 && size(copy) > maxBytes) copy.splice(1, 1);
  return copy;
}

/** The `tool` message that answers one step's calls, in the order they were made. */
export function toolResultsMessage(
  results: { toolCallId: string; toolName: string; output: unknown }[],
): ModelMessage {
  return {
    role: "tool",
    content: results.map((result) => ({
      type: "tool-result",
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      output: { type: "json", value: toJsonValue(result.output) },
    })),
  };
}
