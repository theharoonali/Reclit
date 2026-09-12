import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import type {
  RunAiInput,
  RunAiSearches,
} from "../modules/run-ai/run-ai.schema";
import type { CellGeneration } from "./cell-output";
import { generateTypedCellValue } from "./cell-output";
import { buildCellMessages } from "./cell-prompt";
import { gemini } from "./gemini";
import { buildSearchExtractMessages, searchRecordOf } from "./search-prompt";

// The `google_search` node: Gemini searches Google about the row, then the
// answer it wrote from the results is typed to the target column.
//
// WHY TWO MODEL CALLS AND NOT ONE. The obvious shape is one `generateText`
// with the search tool and `output: Output.object(...)` — the AI SDK types
// allow it. Gemini does not, on the model in use: a JSON response schema
// together with a tool is
//
//   400 INVALID_ARGUMENT
//   "Function calling with a response mime type: 'application/json' is unsupported"
//
// (structured output with tools exists only on Gemini 3 models, as a
// preview). So the loop is unrolled: call 1 grounds — the `google_search`
// tool, no output schema, free text; call 2 shapes that text with the same
// typed-output call an `ai` cell ends on. And since Gemini decides whether to
// use the tool and cannot be forced, the grounded call's metadata is read
// before anything else: a cell whose model recorded no query and no web
// source is failed, not completed from memory — the one thing a node called
// "Google Search" must never do.

type Usage = CellGeneration["usage"];

const add = (a: number | undefined, b: number | undefined) =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

const sumUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: add(a.inputTokens, b.inputTokens),
  outputTokens: add(a.outputTokens, b.outputTokens),
  totalTokens: add(a.totalTokens, b.totalTokens),
});

/**
 * One Google Search cell, end to end. Returns the same `CellGeneration` shape
 * as `generateCellValue` — plus what it searched — so `run-ai-cell` only has
 * to pick a function. `attachments` is always empty: the row's file cells
 * reach the model as text lines, nothing is fetched.
 */
export async function generateSearchCellValue(
  input: RunAiInput,
): Promise<CellGeneration & { searches: RunAiSearches }> {
  // `buildCellMessages` reads `target.node` and adds SEARCH_RULES itself.
  const { system, prompt } = buildCellMessages(input);
  const grounded = await generateText({
    model: gemini(),
    system,
    prompt,
    // The key must be "google_search". The descriptor is static, so building
    // it needs no API key — only the model call does.
    tools: { google_search: google.tools.googleSearch({}) },
  });
  const searches = searchRecordOf(grounded.providerMetadata, grounded.sources);
  if (searches === null) {
    throw new Error(
      `The Google Search cell for column "${input.target.name}" was answered without searching; refusing to complete it from memory`,
    );
  }
  if (grounded.text.trim() === "") {
    throw new Error(
      `The Google Search cell for column "${input.target.name}" searched but produced no text to read a value from`,
    );
  }
  const extract = buildSearchExtractMessages(input, grounded.text);
  const typed = await generateTypedCellValue({
    system: extract.system,
    messages: [{ role: "user", content: extract.prompt }],
    type: input.target.type,
  });
  return {
    output: typed.output,
    model: typed.model,
    usage: sumUsage(
      {
        inputTokens: grounded.usage.inputTokens,
        outputTokens: grounded.usage.outputTokens,
        totalTokens: grounded.usage.totalTokens,
      },
      typed.usage,
    ),
    attachments: [],
    searches,
  };
}
