import { logger, task } from "@trigger.dev/sdk";
import { generateText } from "ai";
import { gemini } from "../ai/gemini";

// Throwaway smoke task: proves the Trigger.dev → Bun → Gemini path end to end.
// Imports nothing from src/modules or src/trpc on purpose.

export const geminiTestTask = task({
  id: "gemini-test",
  maxDuration: 120,
  run: async (payload: { prompt?: string }) => {
    const result = await generateText({
      model: gemini(),
      prompt: payload.prompt ?? "Reply with one short sentence saying hello.",
    });
    logger.info("gemini responded", { usage: result.usage });
    return {
      text: result.text,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  },
});
