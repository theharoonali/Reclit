import { type ColumnMeta, validateWidget } from "@reclit/dashboard-engine";
import { buildRecommendationPrompt } from "../../ai/assistant-prompt";
import {
  generateWidgetRecommendations,
  type RecommendationGeneration,
  type RecommendationGenerator,
} from "../../ai/assistant-recommend";
import { describeError } from "../../common/errors";
import {
  toWidgetQuery,
  widgetQuerySchema,
} from "../dashboard/dashboard.schema";
import { createSheetResolver } from "../dashboard/dashboard-validate";
import {
  AssistantRecommendationsFailedError,
  AssistantRecommendationsUnavailableError,
} from "./assistant.errors";
import {
  type AssistantRecommendation,
  type AssistantRecommendations,
  MAX_RECOMMENDATIONS,
  type RecommendWidgetsInput,
} from "./assistant.schema";
import { loadAssistantContext, toPromptContext } from "./assistant-context";
import { toWidgetQueryInput } from "./assistant-dashboard-tools";
import { defaultWidgetSpan, recommendationCardSchema } from "./assistant-tools";

// Prisma-free: the one synchronous model call of the feature. Reads the
// workspace through the other features' services, asks the model once (no
// run row, no worker), then keeps only the cards that pass the dashboard
// contract and the engine against the sheet's columns — the model proposes,
// the contract decides. The generator is injectable so the contract test
// covers the filtering without a key.

export type RecommendDeps = { generate: RecommendationGenerator };

/** A card's identity for the duplicate check: its type and its query in the schema's key order. */
const fingerprint = (card: { type: string; query: unknown }): string =>
  `${card.type}:${JSON.stringify(widgetQuerySchema.parse(card.query))}`;

/**
 * The model's card as a recommendation with its defaults filled, or null
 * when it fails the strict card schema or the engine's rules for the sheet.
 */
export function toRecommendation(
  raw: unknown,
  columns: ColumnMeta[],
): AssistantRecommendation | null {
  const parsed = recommendationCardSchema.safeParse(raw);
  if (!parsed.success) return null;
  const card = parsed.data;
  const recommendation: AssistantRecommendation = {
    name: card.name,
    description: card.description ?? null,
    type: card.type,
    variant: card.variant ?? "default",
    height: card.height ?? "md",
    column: card.column ?? defaultWidgetSpan(card.type),
    query: toWidgetQueryInput(card.query),
  };
  const issues = validateWidget(
    {
      type: recommendation.type,
      variant: recommendation.variant,
      query: toWidgetQuery(recommendation.query),
    },
    columns,
  );
  return issues.length === 0 ? recommendation : null;
}

export class AssistantRecommendService {
  async recommend(
    input: RecommendWidgetsInput,
    deps: RecommendDeps = { generate: generateWidgetRecommendations },
  ): Promise<AssistantRecommendations> {
    const sheet = await createSheetResolver(input.workspaceId)();
    // `gemini()` would throw a plain Error; name the condition instead.
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new AssistantRecommendationsUnavailableError();
    }
    const context = await loadAssistantContext({
      workspaceId: input.workspaceId,
      scope: "dashboard",
      sheetId: sheet.spreadsheetId,
    });
    const messages = buildRecommendationPrompt(
      toPromptContext("dashboard", context),
      MAX_RECOMMENDATIONS,
    );
    let generated: RecommendationGeneration;
    try {
      generated = await deps.generate(messages);
    } catch (error) {
      throw new AssistantRecommendationsFailedError(
        describeError(error).message,
      );
    }

    const seen = new Set((context.dashboard?.widgets ?? []).map(fingerprint));
    const recommendations: AssistantRecommendation[] = [];
    let skipped = 0;
    for (const raw of generated.cards) {
      const card = toRecommendation(raw, sheet.columns);
      const key = card ? fingerprint(card) : null;
      if (
        card === null ||
        key === null ||
        seen.has(key) ||
        recommendations.length >= MAX_RECOMMENDATIONS
      ) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      recommendations.push(card);
    }
    return {
      spreadsheetId: sheet.spreadsheetId,
      recommendations,
      skipped,
      model: generated.model,
      usage: generated.usage,
    };
  }
}

export const assistantRecommendService = new AssistantRecommendService();
