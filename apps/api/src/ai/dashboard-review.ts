import { generateText, Output } from "ai";
import { z } from "zod";
import type { AssistantUsage } from "../modules/assistant/assistant.schema";
import { REVIEW_VERDICTS } from "../modules/dashboard-generation/dashboard-generation.schema";
import { assistantModelId, toUsage } from "./assistant-step";
import { gemini } from "./gemini";

// The review call of the generate-dashboard task: `generateText` with a JSON
// response schema and no tools. LENIENT like the other two; the strict twin
// `dashboardReviewSchema` runs in the pipeline, and an unreadable review
// counts as a fail (the retry then has the engine's findings to go on).

export const reviewOutputSchema = z.object({
  pass: z.boolean(),
  reasons: z
    .array(z.string())
    .describe("The problems, one line each, most important first"),
  cards: z.array(
    z.object({
      name: z.string(),
      verdict: z.enum(REVIEW_VERDICTS),
      note: z.string().optional(),
    }),
  ),
});

export type ReviewGeneration = {
  /** The model's review, still to be parsed strictly. */
  review: unknown;
  model: string;
  usage: AssistantUsage;
};

/** The model call, as the pipeline takes it — a fake in the contract test. */
export type ReviewGenerator = (input: {
  system: string;
  prompt: string;
}) => Promise<ReviewGeneration>;

export const generateDashboardReview: ReviewGenerator = async ({
  system,
  prompt,
}) => {
  const modelId = assistantModelId();
  const result = await generateText({
    model: gemini(modelId),
    system,
    prompt,
    output: Output.object({ schema: reviewOutputSchema }),
  });
  return {
    review: result.output,
    model: result.response.modelId || modelId,
    usage: toUsage(result.usage),
  };
};
