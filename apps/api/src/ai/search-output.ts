import { google } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { generateText, Output } from "ai";
import type { RunAiInput, RunAiSearch } from "../modules/run-ai/run-ai.schema";
import type { CellGeneration } from "./cell-output";
import { coerceCellValue } from "./cell-output";
import { cellOutputSchema } from "./cell-prompt";
import { gemini } from "./gemini";
import { readGroundedSearch } from "./google-search";
import {
  buildSearchAnswerMessages,
  buildSearchResearchMessages,
} from "./search-prompt";

const add = (a: number | undefined, b: number | undefined) =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

/** Research with Google's provider tool, then format without tools. */
export async function generateSearchCellValue(
  input: RunAiInput,
  model?: LanguageModel,
): Promise<CellGeneration & { searches: RunAiSearch[] }> {
  const researchMessages = buildSearchResearchMessages(input);
  const selectedModel = model ?? gemini();
  const research = await generateText({
    model: selectedModel,
    ...researchMessages,
    tools: { google_search: google.tools.googleSearch({}) },
  });
  const search = readGroundedSearch(
    research.text,
    research.providerMetadata?.google?.groundingMetadata,
  );
  const messages = buildSearchAnswerMessages(input, search);
  const schema = cellOutputSchema(input.target.type);
  const answer =
    schema === null
      ? await generateText({
          model: selectedModel,
          ...messages,
          output: Output.json(),
        })
      : await generateText({
          model: selectedModel,
          ...messages,
          output: Output.object({ schema }),
        });
  const raw =
    schema === null
      ? answer.output
      : (answer.output as { value: unknown }).value;
  return {
    output: coerceCellValue(raw, input.target.type),
    model: answer.response.modelId,
    usage: {
      inputTokens: add(research.usage.inputTokens, answer.usage.inputTokens),
      outputTokens: add(research.usage.outputTokens, answer.usage.outputTokens),
      totalTokens: add(research.usage.totalTokens, answer.usage.totalTokens),
    },
    attachments: [],
    searches: search.queries.map((query) => ({
      query,
      resultCount: search.sources.length,
    })),
  };
}
