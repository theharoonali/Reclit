import {
  type PackedCard,
  packDashboard,
  runWidget,
  type VerifyCard,
  verifyDashboard,
  verifyLayout,
  type WidgetRecord,
} from "@reclit/dashboard-engine";
import { addUsage } from "../../ai/assistant-step";
import {
  type BriefGenerator,
  generateDashboardBrief,
} from "../../ai/dashboard-brief";
import {
  buildAnalyzePrompt,
  buildProposePrompt,
  buildReviewPrompt,
  type ProposalFeedback,
  REVIEW_PREVIEW_ROWS,
  type ReviewCard,
} from "../../ai/dashboard-prompt";
import {
  generateDashboardCards,
  type ProposalGenerator,
} from "../../ai/dashboard-propose";
import {
  generateDashboardReview,
  type ReviewGenerator,
} from "../../ai/dashboard-review";
import type { AssistantUsage } from "../assistant/assistant.schema";
import {
  type AssistantContext,
  loadAssistantContext,
  toPromptContext,
} from "../assistant/assistant-context";
import { toWidgetQueryInput } from "../assistant/assistant-dashboard-tools";
import {
  defaultWidgetSpan,
  proposalCardSchema,
} from "../assistant/assistant-tools";
import { toWidgetQuery } from "../dashboard/dashboard.schema";
import { dashboardService } from "../dashboard/dashboard.service";
import {
  type DashboardBrief,
  type DashboardReview,
  dashboardBriefSchema,
  dashboardReviewSchema,
  type GenerationCard,
  type GenerationPhase,
  type GenerationResult,
  MAX_ATTEMPTS,
  MIN_CARDS,
  type VerifyIssue,
} from "./dashboard-generation.schema";

// Prisma-free and SDK-free (docs/rules/BACKEND.md hard rule 1): the
// generate-dashboard task's work, from the sheet to the applied dashboard —
// analyze (a brief), then up to two rounds of propose → pack → verify →
// review, the second with every mistake of the first fed back, then the best
// round applied through `dashboardService.replace`. Every model call and every
// row write arrives through `deps`, so the contract test drives the whole
// pipeline with fakes and no key. The model proposes; the engine and the
// reviewer decide.

export type PipelineDeps = {
  analyze: BriefGenerator;
  propose: ProposalGenerator;
  review: ReviewGenerator;
  /** The worker enters a phase (written to the row, so streamed to the page). */
  onPhase: (
    phase: GenerationPhase,
    attempt: number,
    detail?: string | null,
  ) => Promise<unknown>;
  /** Throws when the generation was cancelled under us. */
  assertAlive: () => Promise<void>;
  setBrief: (brief: DashboardBrief) => Promise<unknown>;
};

/** The real model calls; the task passes these, the test its fakes. */
export const pipelineGenerators: Pick<
  PipelineDeps,
  "analyze" | "propose" | "review"
> = {
  analyze: generateDashboardBrief,
  propose: generateDashboardCards,
  review: generateDashboardReview,
};

export type PipelineInput = { workspaceId: string; spreadsheetId: string };

export type PipelineOutcome = {
  result: GenerationResult;
  model: string | null;
  usage: AssistantUsage;
};

/** The brief could not be read from the model's answer: nothing to propose from. */
export class DashboardBriefUnusableError extends Error {
  constructor(cause: string) {
    super(`The dashboard brief could not be read: ${cause}`);
    this.name = "DashboardBriefUnusable";
  }
}

type PlacedCard = PackedCard<GenerationCard>;

type Attempt = {
  attempt: number;
  cards: PlacedCard[];
  issues: VerifyIssue[];
  review: DashboardReview | null;
  warnings: number;
  /** Nothing was dropped and the reviewer passed it. */
  passed: boolean;
};

const EMPTY_USAGE: AssistantUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

/** The sheet's own uniqueness rule: trimmed, case-insensitive. */
const nameKey = (name: string): string => name.trim().toLowerCase();

/** The brief, parsed strictly, with columns the sheet does not have dropped. */
export function parseBrief(
  raw: unknown,
  columns: readonly { name: string }[],
): DashboardBrief {
  const parsed = dashboardBriefSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DashboardBriefUnusableError(
      parsed.error.issues[0]?.message ?? "invalid",
    );
  }
  const known = new Set(columns.map((column) => nameKey(column.name)));
  return {
    ...parsed.data,
    columns: parsed.data.columns.filter((column) =>
      known.has(nameKey(column.name)),
    ),
  };
}

/** One raw card → a normalised card, or null when it fails the strict schema. */
export function toGenerationCard(raw: unknown): GenerationCard | null {
  const parsed = proposalCardSchema.safeParse(raw);
  if (!parsed.success) return null;
  const card = parsed.data;
  const query = toWidgetQueryInput(card.query);
  // A split by the grouping column is a diagonal matrix, never meant: the
  // card without the split is what was asked for.
  const splitsItself =
    query.splitBy &&
    query.groupBy &&
    nameKey(query.splitBy.column) === nameKey(query.groupBy.column);
  const { splitBy: _splitBy, ...unsplit } = query;
  return {
    name: card.name,
    description: card.description ?? null,
    type: card.type,
    variant: card.variant ?? "default",
    // A stat is a figure: the short card unless the model asked otherwise.
    height: card.height ?? (card.type === "stat" ? "sm" : "md"),
    column: card.column ?? defaultWidgetSpan(card.type),
    query: {
      ...(splitsItself ? unsplit : query),
      series: query.series.map(({ prefix, suffix, ...series }) => {
        const unitPrefix = unitOrNothing(prefix);
        const unitSuffix = unitOrNothing(suffix);
        return {
          ...series,
          ...(unitPrefix !== undefined && { prefix: unitPrefix }),
          ...(unitSuffix !== undefined && { suffix: unitSuffix }),
        };
      }),
    },
  };
}

/** A real unit: a currency symbol or at most three ASCII letters / `%` — anything else the model made up and is dropped. */
const UNIT_RE = /^(?:\p{Sc}|%|[A-Za-z]{1,3}|\p{Sc}[A-Za-z]{0,2})$/u;

export function unitOrNothing(unit: string | undefined): string | undefined {
  if (unit === undefined) return undefined;
  const trimmed = unit.trim();
  return UNIT_RE.test(trimmed) ? trimmed : undefined;
}

const toVerifyCard = (card: PlacedCard): VerifyCard => ({
  type: card.type,
  variant: card.variant,
  query: toWidgetQuery(card.query),
  name: card.name,
  column: card.column,
});

/** The grid as lines ("row 0: 3 + 3 + 3 + 3 = 12"), plus what `verifyLayout` found wrong. */
export function describeLayout(cards: readonly PlacedCard[]): string[] {
  const rows = new Map<number, number[]>();
  for (const card of cards) {
    rows.set(card.row, [...(rows.get(card.row) ?? []), card.column]);
  }
  const lines = [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(
      ([row, widths]) =>
        `row ${row}: ${widths.join(" + ")} = ${widths.reduce((sum, width) => sum + width, 0)}`,
    );
  return [...lines, ...verifyLayout(cards).map((issue) => issue.message)];
}

/** The placed cards without their slots — what the next packing takes. */
const unplaced = (cards: readonly PlacedCard[]): GenerationCard[] =>
  cards.map(({ row: _row, sort: _sort, ...card }) => card);

/** The review, parsed strictly; an unreadable one fails the attempt with a reason the retry can read. */
export function parseReview(raw: unknown): DashboardReview {
  const parsed = dashboardReviewSchema.safeParse(raw);
  return parsed.success
    ? parsed.data
    : {
        pass: false,
        reasons: ["The reviewer's answer could not be read"],
        cards: [],
      };
}

export class DashboardGenerationPipelineService {
  async run(
    input: PipelineInput,
    deps: PipelineDeps,
  ): Promise<PipelineOutcome> {
    let usage = EMPTY_USAGE;
    let model: string | null = null;
    const record = (generation: { model: string; usage: AssistantUsage }) => {
      usage = addUsage(usage, generation.usage);
      model = generation.model;
    };

    await deps.onPhase("analyzing", 0);
    const context = await loadAssistantContext({
      workspaceId: input.workspaceId,
      scope: "dashboard",
      sheetId: input.spreadsheetId,
    });
    const promptContext = toPromptContext("dashboard", context);
    const analyzed = await deps.analyze(buildAnalyzePrompt(promptContext));
    record(analyzed);
    const brief = parseBrief(analyzed.brief, context.columns);
    await deps.setBrief(brief);

    const attempts: Attempt[] = [];
    let feedback: ProposalFeedback | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await deps.assertAlive();
      if (feedback) {
        await deps.onPhase(
          "retrying",
          attempt,
          `${feedback.issues.length} issues to fix`,
        );
      }
      await deps.onPhase("proposing", attempt);
      const proposed = await deps.propose(
        buildProposePrompt(promptContext, brief, feedback),
      );
      record(proposed);
      const outcome = await this.verifyAttempt(
        attempt,
        proposed.cards,
        context,
        brief,
        deps,
      );
      record(outcome.reviewed);
      attempts.push(outcome.attempt);
      if (outcome.attempt.passed) break;
      feedback = outcome.feedback;
    }

    const best = pickBest(attempts);
    if (best.cards.length === 0) {
      return {
        result: {
          cardCount: 0,
          applied: false,
          attempts: attempts.length,
          issues: best.issues,
          review: best.review,
          reason: "no_value",
        },
        model,
        usage,
      };
    }

    await deps.assertAlive();
    await deps.onPhase("applying", best.attempt, `${best.cards.length} cards`);
    await dashboardService.replace({
      workspaceId: input.workspaceId,
      widgets: best.cards.map((card) => ({
        ...card,
        spreadsheetId: input.spreadsheetId,
      })),
    });
    return {
      result: {
        cardCount: best.cards.length,
        applied: true,
        attempts: attempts.length,
        issues: best.issues,
        review: best.review,
        reason: "ok",
      },
      model,
      usage,
    };
  }

  /**
   * One round after the model answered: parse → pack → verify (drop every
   * card with an error) → re-pack → review (drop what the critic rejects).
   * Answers the attempt as kept, and the feedback the next round would get.
   */
  private async verifyAttempt(
    attempt: number,
    rawCards: unknown[],
    context: AssistantContext,
    brief: DashboardBrief,
    deps: PipelineDeps,
  ): Promise<{
    attempt: Attempt;
    feedback: ProposalFeedback;
    reviewed: { model: string; usage: AssistantUsage };
  }> {
    const cards: GenerationCard[] = [];
    const unparsable: { raw: unknown; index: number }[] = [];
    rawCards.forEach((raw, index) => {
      const card = toGenerationCard(raw);
      if (card) cards.push(card);
      else unparsable.push({ raw, index });
    });

    await deps.onPhase("laying_out", attempt, `${cards.length} cards`);
    const proposedPlaced = packDashboard(cards);

    await deps.onPhase("verifying", attempt);
    const payload = context.payload;
    const profile = context.profile ?? [];
    const engineIssues: VerifyIssue[] = payload
      ? verifyDashboard(proposedPlaced.map(toVerifyCard), payload, profile)
      : [];
    const unparsableIssues: VerifyIssue[] = unparsable.map((item, offset) => ({
      code: "UNPARSABLE",
      severity: "error",
      cardIndex: proposedPlaced.length + offset,
      cardName: nameOf(item.raw) ?? `card ${item.index}`,
      message: "The card does not match the dashboard contract",
    }));
    const errored = new Set(
      engineIssues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.cardIndex),
    );
    let placed = packDashboard(
      unplaced(proposedPlaced.filter((_, index) => !errored.has(index))),
    );

    let review: DashboardReview | null = null;
    let dropped: string[] = [];
    let reviewed = { model: "", usage: EMPTY_USAGE };
    if (placed.length > 0 && payload) {
      const reviewCards: ReviewCard[] = placed.map((card) => {
        const result = runWidget(toVerifyCard(card), payload);
        const rows: WidgetRecord[] = result.ok
          ? result.data.rows.slice(0, REVIEW_PREVIEW_ROWS)
          : [];
        return {
          name: card.name,
          description: card.description,
          type: card.type,
          variant: card.variant,
          column: card.column,
          row: card.row,
          query: card.query,
          rows,
        };
      });
      const answer = await deps.review(
        buildReviewPrompt(
          brief,
          reviewCards,
          engineIssues,
          describeLayout(placed),
        ),
      );
      reviewed = { model: answer.model, usage: answer.usage };
      review = parseReview(answer.review);
      dropped = review.cards
        .filter((card) => card.verdict === "drop")
        .map((card) => card.name);
      if (dropped.length > 0) {
        const gone = new Set(dropped.map(nameKey));
        placed = packDashboard(
          unplaced(placed.filter((card) => !gone.has(nameKey(card.name)))),
        );
      }
    }

    const issues = [...engineIssues, ...unparsableIssues];
    const passed =
      review?.pass === true &&
      placed.length >= MIN_CARDS &&
      errored.size === 0 &&
      unparsable.length === 0 &&
      dropped.length === 0;
    return {
      attempt: {
        attempt,
        cards: placed,
        issues,
        review,
        warnings: issues.filter((issue) => issue.severity === "warn").length,
        passed,
      },
      feedback: {
        previousCards: [
          ...proposedPlaced.map((card) => ({
            name: card.name,
            type: card.type,
            variant: card.variant,
            column: card.column,
            query: card.query,
          })),
          ...unparsable.map((item) => ({
            name: nameOf(item.raw) ?? `card ${item.index}`,
            type: "unknown",
            variant: "unknown",
            column: 0,
            query: item.raw,
          })),
        ],
        issues,
        layout: describeLayout(placed),
        // The reviewer's reasons, then its per-card notes for what it would fix or drop.
        reviewReasons: [
          ...(review?.reasons ?? []),
          ...(review?.cards ?? [])
            .filter((card) => card.verdict !== "keep" && card.note)
            .map((card) => `"${card.name}": ${card.verdict} — ${card.note}`),
        ],
        dropped,
      },
      reviewed,
    };
  }
}

/** A passing attempt wins; otherwise the one with the most cards, then the fewest warnings. */
export function pickBest(attempts: readonly Attempt[]): Attempt {
  const passing = attempts.filter((attempt) => attempt.passed).at(-1);
  if (passing) return passing;
  const [first, ...rest] = attempts;
  if (!first) throw new Error("unreachable: at least one attempt was made");
  return rest.reduce(
    (best, attempt) =>
      attempt.cards.length > best.cards.length ||
      (attempt.cards.length === best.cards.length &&
        attempt.warnings < best.warnings)
        ? attempt
        : best,
    first,
  );
}

/** The `name` of a raw card when it has one — so an unparsable card can still be named in the feedback. */
function nameOf(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null) return null;
  const name = (raw as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export const dashboardGenerationPipelineService =
  new DashboardGenerationPipelineService();
