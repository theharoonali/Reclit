import { generateText, Output } from "ai";
import type { RunAiInput, RunAiSearch } from "../modules/run-ai/run-ai.schema";
import type { CellGeneration } from "./cell-output";
import { coerceCellValue } from "./cell-output";
import { cellOutputSchema } from "./cell-prompt";
import { gemini } from "./gemini";
import {
  buildSearchAnswerMessages,
  buildSearchQueryMessages,
  fallbackQuery,
  searchQuerySchema,
} from "./search-prompt";
import type { SearchFetch, SearchResponse } from "./serpapi";
import { googleSearch } from "./serpapi";

// The `google_search` node: search Google for what the row's chosen columns
// name, then read the answer out of the results, typed to the target column.
//
// WHY TWO MODEL CALLS AND NOT A TOOL. The obvious shape is one `generateText`
// with a search tool and `output: Output.object(...)` — the AI SDK types
// allow it. Gemini does not: it answers
//
//   400 INVALID_ARGUMENT
//   "Function calling with a response mime type: 'application/json' is unsupported"
//
// and forcing the tool (`toolChoice: "required"`) is refused for the same
// reason. So the loop is unrolled: the model writes the query, *we* run the
// search, the model reads the answer. That is strictly better here anyway —
// a tool call cannot be forced on Gemini, so a tool-shaped node could quietly
// answer from memory without ever searching, which is the one thing a node
// called "Google Search" must not do. This way the search always happens.

/** A query the model wrote plus what it returned; the row of `result.searches`. */
type Attempt = { search: SearchResponse; record: RunAiSearch };

async function attempt(
  query: string,
  fetchImpl?: SearchFetch,
): Promise<Attempt> {
  const search = await googleSearch(query, fetchImpl);
  return {
    search,
    record: { query, resultCount: search.results.length },
  };
}

/** Step one: the query, written from the source cells alone. */
async function writeQuery(input: RunAiInput) {
  const { system, prompt } = buildSearchQueryMessages(input);
  const result = await generateText({
    model: gemini(),
    system,
    prompt,
    output: Output.object({ schema: searchQuerySchema }),
  });
  return { query: result.output.query.trim(), usage: result.usage };
}

/** Step two: the value, read out of the results and typed to the column. */
async function readAnswer(input: RunAiInput, searches: SearchResponse[]) {
  const { system, prompt } = buildSearchAnswerMessages(input, searches);
  const schema = cellOutputSchema(input.target.type);
  const result =
    schema === null
      ? await generateText({
          model: gemini(),
          system,
          prompt,
          output: Output.json(),
        })
      : await generateText({
          model: gemini(),
          system,
          prompt,
          output: Output.object({ schema }),
        });
  const raw =
    schema === null
      ? result.output
      : (result.output as { value: unknown }).value;
  return {
    output: coerceCellValue(raw, input.target.type),
    model: result.response.modelId,
    usage: result.usage,
  };
}

const add = (a: number | undefined, b: number | undefined) =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

/**
 * One Google Search cell, end to end. Returns the same `CellGeneration` shape
 * as `generateCellValue` — plus the queries it ran — so `run-ai-cell` only
 * has to pick a function.
 *
 * A query that comes back empty is retried once with the source values
 * verbatim (`fallbackQuery`): a model-written query can over-constrain, and
 * the bare subject is the query Google is best at. Both attempts are recorded.
 */
export async function generateSearchCellValue(
  input: RunAiInput,
  fetchImpl?: SearchFetch,
): Promise<CellGeneration & { searches: RunAiSearch[] }> {
  const written = await writeQuery(input);
  const attempts = [await attempt(written.query, fetchImpl)];

  const fallback = fallbackQuery(input);
  if (attempts[0]?.search.results.length === 0 && fallback !== written.query) {
    attempts.push(await attempt(fallback, fetchImpl));
  }

  const answer = await readAnswer(
    input,
    attempts.map((one) => one.search),
  );

  return {
    output: answer.output,
    model: answer.model,
    usage: {
      inputTokens: add(written.usage.inputTokens, answer.usage.inputTokens),
      outputTokens: add(written.usage.outputTokens, answer.usage.outputTokens),
      totalTokens: add(written.usage.totalTokens, answer.usage.totalTokens),
    },
    // A search node never fetches the row's files; the row is not even in the
    // input.
    attachments: [],
    searches: attempts.map((one) => one.record),
  };
}
