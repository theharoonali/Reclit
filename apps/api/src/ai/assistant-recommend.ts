import {
  BUCKETS,
  CHART_COLORS,
  COLUMN_KINDS,
  FILTER_OPS,
  WIDGET_HEIGHTS,
  WIDGET_TYPES,
} from "@reclit/dashboard-engine";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AssistantUsage } from "../modules/assistant/assistant.schema";
import { assistantModelId, toUsage } from "./assistant-step";
import { gemini } from "./gemini";

// The one-shot recommendation call: `generateText` with a JSON response
// schema and no tools (Gemini refuses both in one request — search-output.ts).
// The schema here is deliberately LENIENT: plain strings where the contract
// wants an identifier pattern, no array caps. The Google provider drops
// `pattern` and `maxItems` from a response schema, so a strict `Output.object`
// would throw the whole answer away over one bad series key; the strict twin
// (`recommendationCardSchema`, assistant-tools.ts) runs per card in the
// service, and a bad card costs one card.

const scalar = z.union([z.string(), z.number(), z.boolean()]);

const filterSchema = z.object({
  column: z.string(),
  op: z.enum(FILTER_OPS),
  value: scalar
    .optional()
    .describe("The value to compare with; omit for isEmpty, notEmpty and in"),
  values: z
    .array(z.union([z.string(), z.number()]))
    .optional()
    .describe("The list of values for `in`"),
});

const seriesSchema = z.object({
  key: z
    .string()
    .describe("An identifier (letters, digits, _ -), unique within the card"),
  label: z.string(),
  formula: z.string(),
  color: z.enum(CHART_COLORS).optional(),
  decimals: z.number().int().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  kind: z.enum(COLUMN_KINDS).optional().describe("Tables only"),
});

const querySchema = z.object({
  filters: z.array(filterSchema).optional(),
  groupBy: z
    .object({ column: z.string(), bucket: z.enum(BUCKETS).optional() })
    .optional()
    .describe("The x-axis / slices / groups; omit for stat and plain tables"),
  splitBy: z
    .object({
      column: z.string(),
      bucket: z.enum(BUCKETS).optional(),
      limit: z.number().int().optional(),
    })
    .optional(),
  series: z.array(seriesSchema),
  sort: z
    .object({ by: z.string(), direction: z.enum(["asc", "desc"]) })
    .optional(),
  limit: z.number().int().optional(),
  compare: z
    .object({ formula: z.string(), label: z.string() })
    .optional()
    .describe("Stat only"),
  footer: z.string().optional(),
});

/** What the model answers: cards in the shape of the createWidget tool, loosely typed. */
export const recommendationOutputSchema = z.object({
  cards: z.array(
    z.object({
      name: z.string(),
      description: z
        .string()
        .optional()
        .describe("One line saying what the card shows"),
      type: z.enum(WIDGET_TYPES),
      variant: z.string().optional(),
      height: z.enum(WIDGET_HEIGHTS).optional(),
      column: z
        .number()
        .int()
        .optional()
        .describe("The width in grid columns, of 12"),
      query: querySchema,
    }),
  ),
});

export type RecommendationGeneration = {
  /** The model's cards, each still to be parsed strictly and validated. */
  cards: unknown[];
  model: string;
  usage: AssistantUsage;
};

/** The model call, as the service takes it — a fake in the contract test. */
export type RecommendationGenerator = (input: {
  system: string;
  prompt: string;
}) => Promise<RecommendationGeneration>;

export const generateWidgetRecommendations: RecommendationGenerator = async ({
  system,
  prompt,
}) => {
  const modelId = assistantModelId();
  const result = await generateText({
    model: gemini(modelId),
    system,
    prompt,
    output: Output.object({ schema: recommendationOutputSchema }),
  });
  const output = recommendationOutputSchema.parse(result.output);
  return {
    cards: output.cards,
    model: result.response.modelId || modelId,
    usage: toUsage(result.usage),
  };
};
