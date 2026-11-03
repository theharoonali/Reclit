import { generateText, type ModelMessage, Output } from "ai";
import { z } from "zod";
import type { AssistantUsage } from "../modules/assistant/assistant.schema";
import { assistantModelId, toUsage } from "./assistant-step";
import { gemini } from "./gemini";

// The company profile's model calls: the summary (from the homepage, then
// from the whole crawl — one generator, two prompts) and a document's digest.
// The summary is `generateText` with a JSON response schema and no tools; the
// schema is deliberately LENIENT (plain strings, no caps — the Google provider
// drops constraints from a response schema) and its strict twin
// `companySummarySchema` (company.schema.ts) runs in the service. The digest
// is free markdown: a PDF or an image travels as a native file part.

export const companySummaryOutputSchema = z.object({
  name: z.string().describe("The company's own name"),
  summary: z
    .string()
    .describe("Three to five plain sentences on what the company does"),
});

type PromptMessages = { system: string; prompt: string };

export type CompanySummaryGeneration = {
  /** The model's answer, still to be parsed strictly. */
  summary: unknown;
  model: string;
  usage: AssistantUsage;
};

/** The summary call, as the service and the crawl task take it — a fake in the contract test. */
export type CompanySummaryGenerator = (
  input: PromptMessages,
) => Promise<CompanySummaryGeneration>;

export const generateCompanySummary: CompanySummaryGenerator = async ({
  system,
  prompt,
}) => {
  const modelId = assistantModelId();
  const result = await generateText({
    model: gemini(modelId),
    system,
    prompt,
    output: Output.object({ schema: companySummaryOutputSchema }),
  });
  return {
    summary: result.output,
    model: result.response.modelId || modelId,
    usage: toUsage(result.usage),
  };
};

export type DocumentDigestInput = PromptMessages & {
  /** A PDF or an image; text documents are inline in `prompt` instead. */
  file?: { data: Uint8Array; mediaType: string; filename: string } | null;
};

export type DocumentDigestGeneration = {
  digest: string;
  model: string;
  usage: AssistantUsage;
};

/** The digest call, as the document task takes it — a fake in the contract test. */
export type DocumentDigestGenerator = (
  input: DocumentDigestInput,
) => Promise<DocumentDigestGeneration>;

export const generateDocumentDigest: DocumentDigestGenerator = async ({
  system,
  prompt,
  file,
}) => {
  const modelId = assistantModelId();
  const message: ModelMessage = {
    role: "user",
    content: [
      { type: "text", text: prompt },
      ...(file
        ? [
            {
              type: "file" as const,
              data: file.data,
              mediaType: file.mediaType,
              filename: file.filename,
            },
          ]
        : []),
    ],
  };
  const result = await generateText({
    model: gemini(modelId),
    system,
    messages: [message],
  });
  return {
    digest: result.text,
    model: result.response.modelId || modelId,
    usage: toUsage(result.usage),
  };
};
