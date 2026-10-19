import { generateText, Output } from "ai";
import { z } from "zod";
import type { AssistantUsage } from "../modules/assistant/assistant.schema";
import { assistantModelId, toUsage } from "./assistant-step";
import { gemini } from "./gemini";

// The onboarding wizard's two one-shot calls — describe the uploaded sheet,
// then propose AI columns — as `generateText` with a JSON response schema and
// no tools (assistant-recommend.ts is the template). The schemas here are
// deliberately LENIENT (plain strings, no caps, no enums for the model to
// trip on): the Google provider drops constraints from a response schema, so
// a strict `Output.object` would lose the whole answer over one bad field.
// The strict twins live in onboarding.schema.ts and run per item in the
// services, so a bad column costs one column.

export const describeOutputSchema = z.object({
  suggestedName: z.string().describe("A workspace name, at most 40 characters"),
  description: z
    .string()
    .describe("One to three plain sentences on what the sheet holds"),
  purpose: z
    .string()
    .describe("What the sheet is, in two to four words, Title case"),
});

export const suggestOutputSchema = z.object({
  columns: z.array(
    z.object({
      name: z.string(),
      type: z.string().describe("string, number, boolean or date"),
      prompt: z.string().describe("The instruction the AI follows for one row"),
    }),
  ),
  needsMoreContext: z
    .boolean()
    .describe("True when the data is too unclear to propose anything useful"),
  question: z
    .string()
    .nullable()
    .describe("One question for the user when needsMoreContext is true"),
});

export type DescribeGeneration = {
  /** The model's answer, still to be parsed strictly. */
  described: unknown;
  model: string;
  usage: AssistantUsage;
};

export type SuggestGeneration = {
  /** The model's columns, each still to be parsed strictly. */
  columns: unknown[];
  needsMoreContext: boolean;
  question: string | null;
  model: string;
  usage: AssistantUsage;
};

type PromptMessages = { system: string; prompt: string };

/** The describe call, as the service takes it — a fake in the contract test. */
export type DescribeGenerator = (
  input: PromptMessages,
) => Promise<DescribeGeneration>;

/** The suggest call, as the service takes it — a fake in the contract test. */
export type SuggestGenerator = (
  input: PromptMessages,
) => Promise<SuggestGeneration>;

export const generateSheetDescription: DescribeGenerator = async ({
  system,
  prompt,
}) => {
  const modelId = assistantModelId();
  const result = await generateText({
    model: gemini(modelId),
    system,
    prompt,
    output: Output.object({ schema: describeOutputSchema }),
  });
  return {
    described: describeOutputSchema.parse(result.output),
    model: result.response.modelId || modelId,
    usage: toUsage(result.usage),
  };
};

export const generateColumnSuggestions: SuggestGenerator = async ({
  system,
  prompt,
}) => {
  const modelId = assistantModelId();
  const result = await generateText({
    model: gemini(modelId),
    system,
    prompt,
    output: Output.object({ schema: suggestOutputSchema }),
  });
  const output = suggestOutputSchema.parse(result.output);
  return {
    columns: output.columns,
    needsMoreContext: output.needsMoreContext,
    question: output.question,
    model: result.response.modelId || modelId,
    usage: toUsage(result.usage),
  };
};
