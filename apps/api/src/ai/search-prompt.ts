import type { GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import type { ProviderMetadata } from "ai";
import type {
  RunAiInput,
  RunAiSearches,
} from "../modules/run-ai/run-ai.schema";
import { TYPE_RULES } from "./cell-prompt";

// Pure: the two halves of a `google_search` cell that need no SDK call — the
// extraction call's prompt (what the model is asked once the grounded text
// exists) and the reading of the grounded call's metadata (did it search, and
// what). No network, so the contract test covers both without an API key.
// The calls themselves live in search-output.ts; the grounded call's own
// prompt is `buildCellMessages` plus `SEARCH_RULES` (cell-prompt.ts).

/** The most cited pages kept on the run; past that they are noise on a row that already holds the answer. */
export const MAX_SEARCH_SOURCES = 20;

/**
 * Step two: the grounded text, the instruction, and the shape the answer must
 * have for this column's type — the same `TYPE_RULES` sentence an `ai` cell
 * gets, so "typed by the column" needs no per-node rules. The text is the
 * model's own research note, already written from the search results; this
 * call only has to lift the value out of it.
 */
export function buildSearchExtractMessages(
  input: RunAiInput,
  text: string,
): { system: string; prompt: string } {
  const system = [
    "You fill in one cell of a spreadsheet from a research note.",
    `The cell belongs to the column "${input.target.name}" (type: ${input.target.type}).`,
    "Instruction for this column:",
    input.prompt,
    "",
    `Answer with ${TYPE_RULES[input.target.type]}, and nothing else.`,
    "The note below was written from Google Search results for this instruction. Take the value from the note and add nothing the note does not say.",
    "Never answer with a vertexaisearch.cloud.google.com link; use the address of the site as the note names it.",
  ].join("\n");
  const prompt = [
    "Research note:",
    text,
    "",
    `Fill the column "${input.target.name}".`,
  ].join("\n");
  return { system, prompt };
}

/** `result.sources`, structurally: a document source has no `url` and is skipped. */
export type SearchSourceLike = {
  sourceType: string;
  url?: string;
  title?: string;
};

/**
 * The queries and pages behind a grounded answer, or `null` when the model
 * did not search. Gemini cannot be forced to use the tool, so this is the
 * check that keeps the node honest: no query and no web source means the
 * text came from memory, and a Google Search cell must not complete on it.
 * `webSearchQueries` is the primary signal; a web source without a recorded
 * query still counts as a search.
 */
export function searchRecordOf(
  providerMetadata: ProviderMetadata | undefined,
  sources: ReadonlyArray<SearchSourceLike>,
): RunAiSearches | null {
  const google = providerMetadata?.google as
    | GoogleGenerativeAIProviderMetadata
    | undefined;
  const queries = (google?.groundingMetadata?.webSearchQueries ?? []).filter(
    (query) => query.trim() !== "",
  );
  const seen = new Set<string>();
  const pages: RunAiSearches["sources"] = [];
  for (const source of sources) {
    if (source.sourceType !== "url" || !source.url || seen.has(source.url)) {
      continue;
    }
    seen.add(source.url);
    pages.push({
      url: source.url,
      ...(source.title && { title: source.title }),
    });
    if (pages.length === MAX_SEARCH_SOURCES) break;
  }
  return queries.length === 0 && pages.length === 0
    ? null
    : { queries, sources: pages };
}
