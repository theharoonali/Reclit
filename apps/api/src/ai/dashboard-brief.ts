import { generateText, Output } from "ai";
import { z } from "zod";
import type { AssistantUsage } from "../modules/assistant/assistant.schema";
import { BRIEF_COLUMN_USES } from "../modules/dashboard-generation/dashboard-generation.schema";
import { assistantModelId, toUsage } from "./assistant-step";
import { aiModel } from "./model";

// The analyze call of the generate-dashboard task: `generateText` with a JSON
// response schema and no tools. LENIENT on purpose (plain strings, no array
// caps — the Google provider drops them from a response schema); the strict
// twin `dashboardBriefSchema` runs in the pipeline and decides.

export const briefOutputSchema = z.object({
  subject: z.string().describe("One line: what one row of the sheet is"),
  questions: z
    .array(z.string())
    .describe("The questions the data should answer, most valuable first"),
  columns: z.array(
    z.object({
      name: z.string(),
      use: z.enum(BRIEF_COLUMN_USES),
      note: z.string().optional(),
    }),
  ),
});

export type BriefGeneration = {
  /** The model's brief, still to be parsed strictly. */
  brief: unknown;
  model: string;
  usage: AssistantUsage;
};

/** The model call, as the pipeline takes it — a fake in the contract test. */
export type BriefGenerator = (input: {
  system: string;
  prompt: string;
}) => Promise<BriefGeneration>;

export const generateDashboardBrief: BriefGenerator = async ({
  system,
  prompt,
}) => {
  const modelId = assistantModelId();
  const result = await generateText({
    model: aiModel(modelId),
    system,
    prompt,
    output: Output.object({ schema: briefOutputSchema }),
  });
  return {
    brief: result.output,
    model: result.response.modelId || modelId,
    usage: toUsage(result.usage),
  };
};
