import {
  MAX_CATEGORIES_BY_SPAN,
  MAX_LABEL_CHARS,
  MAX_PIE_SLICES,
  type WidgetRecord,
} from "@reclit/dashboard-engine";
import {
  type DashboardBrief,
  MAX_CARDS,
  type VerifyIssue,
} from "../modules/dashboard-generation/dashboard-generation.schema";
import {
  type AssistantPromptContext,
  CHART_SENSE_RULES,
  describeData,
  truncateValue,
  UNTRUSTED_DATA_RULE,
  WIDGET_GRAMMAR,
} from "./assistant-prompt";

// Pure: the three prompts of the generate-dashboard task — analyze (a brief),
// propose (the cards, with the previous attempt's mistakes when retrying) and
// review (a critic's verdict) — from plain descriptions, so the contract test
// asserts them without an API key. No tools: each is `generateText` with a
// JSON response schema, the data blocks as `system` and the task as the user
// `prompt`.

/** What the retry is told about the attempt it replaces. */
export type ProposalFeedback = {
  /** Every card of the previous attempt as proposed, before any was dropped. */
  previousCards: {
    name: string;
    type: string;
    variant: string;
    column: number;
    query: unknown;
  }[];
  /** What the engine found wrong, per card. */
  issues: VerifyIssue[];
  /** What the packed layout looked like after the drops ("row 1: 6" — under-filled). */
  layout: string[];
  /** The reviewer's reasons for failing the attempt. */
  reviewReasons: string[];
  /** Cards the reviewer said to drop, by name. */
  dropped: string[];
};

/** One placed card as the reviewer sees it, with the first rows the engine computed for it. */
export type ReviewCard = {
  name: string;
  description: string | null;
  type: string;
  variant: string;
  column: number;
  row: number;
  query: unknown;
  rows: WidgetRecord[];
};

/** How many computed rows the reviewer is shown per card. */
export const REVIEW_PREVIEW_ROWS = 3;

const BRIEF_SHAPE =
  '{ "subject": string, "questions": string[], "columns": [{ "name": string, "use": "measure" | "axis" | "category" | "identifier" | "noise", "note"?: string }] }';

/**
 * The analyze call: what one row is, which questions matter and what every
 * column is for. The brief is the propose call's compass.
 */
export function buildAnalyzePrompt(context: AssistantPromptContext): {
  system: string;
  prompt: string;
} {
  const system = [
    UNTRUSTED_DATA_RULE,
    ...describeData({ ...context, scope: "dashboard" }),
  ].join("\n\n");
  const prompt = [
    `Write a brief for a dashboard over this sheet, as JSON: ${BRIEF_SHAPE}.`,
    "subject: one line saying what one row is ('one customer order', 'one job applicant').",
    "questions: the three to eight questions the person responsible for this data asks first, most valuable first — questions the sheet can actually answer with its columns.",
    "columns: every column with its use — measure (a quantity to sum or average), axis (a date or year to plot over), category (a few repeating values to group by), identifier (unique per row; never aggregated, never grouped), noise (free text, URLs, notes; not chartable). Read <column-profile> for the roles and figures. Treat a PENDING AI COLUMN as populated with values of its type.",
    "Answer with the JSON only.",
  ].join(" ");
  return { system, prompt };
}

/** The `<brief>` block the propose and review calls carry. */
export function describeBrief(brief: DashboardBrief): string {
  const columns = brief.columns
    .map(
      (column) =>
        `- ${column.name}: ${column.use}${column.note ? ` — ${truncateValue(column.note, 120)}` : ""}`,
    )
    .join("\n");
  const questions = brief.questions
    .map((question, index) => `${index + 1}. ${question}`)
    .join("\n");
  return `<brief>\nSubject: one row is ${brief.subject}\nQuestions, most valuable first:\n${questions}\nColumns:\n${columns}\n</brief>`;
}

/** The value, chart-count and layout rules every proposal obeys. */
const PROPOSE_RULES = [
  `Propose at most ${MAX_CARDS} cards. Every card answers one of the brief's questions; a question no card can answer well gets no card. No value, no card: fewer good cards beat more, and an empty answer beats a filler card.`,
  "Stat cards only for a real measure (use: measure — a total or an average) or the row count when the subject is what the person counts. Never COUNT or COUNT_DISTINCT an identifier as a stat (it is the row count in disguise), never two stats of the same figure, never SUM or AVG a year, a date, an identifier or text.",
  `A chart needs two or more groups and not too many: pie and donut at most ${MAX_PIE_SLICES} slices; a vertical bar, line or area at most ${MAX_CATEGORIES_BY_SPAN["6"]} categories when 6 wide and ${MAX_CATEGORIES_BY_SPAN["12"]} when 12 wide. More categories than that: sort by the measure desc with a limit, use bar variant horizontal, or make it a table.`,
  `Category labels longer than ${MAX_LABEL_CHARS} characters belong on a bar with variant horizontal, never on an x-axis. Over time: line or area grouped by the date column with a bucket (month, quarter or year) that yields four to sixteen points.`,
  "A table only for 'the top N rows by a measure' (sorted desc, limit 10, 12 wide), grouped by one column, never split. splitBy belongs on a bar, line or area only, and its column must differ from groupBy. Never two cards that show the same thing.",
  "A series prefix or suffix is a real unit the data has — a currency symbol ($, €, £) or a short unit (%, h, kg), at most three characters — and only when the sheet says so (a column name, the description); otherwise leave both out.",
  "Widths (column): stats 3 or 4 so that a row of stats sums to 12 — two, three or four stats, never one or five; charts 6 (they pair) or 12 (a long time series, or the only chart); tables 12. Leave row and sort out. Name each card as its question ('Revenue by region'), and set description to one line saying what it shows.",
].join(" ");

function describeFeedback(feedback: ProposalFeedback): string {
  const byCard = new Map<number, string[]>();
  for (const issue of feedback.issues) {
    const list = byCard.get(issue.cardIndex) ?? [];
    list.push(
      `${issue.severity}: ${issue.code} — ${issue.message}${issue.detail ? ` (${truncateValue(issue.detail, 160)})` : ""}`,
    );
    byCard.set(issue.cardIndex, list);
  }
  const cards = feedback.previousCards.map((card, index) => {
    const issues = byCard.get(index) ?? [];
    const dropped = feedback.dropped.some(
      (name) => name.trim().toLowerCase() === card.name.trim().toLowerCase(),
    );
    const notes = [
      ...(dropped ? ["the reviewer said to drop this card"] : []),
      ...issues,
    ];
    return `- "${card.name}" ${card.type}/${card.variant} width ${card.column}; query ${JSON.stringify(card.query)}\n  ${notes.length > 0 ? notes.join("\n  ") : "no issue found"}`;
  });
  const parts = [
    `<previous-attempt>\nYour previous proposal and what was wrong with it:\n${cards.join("\n")}`,
  ];
  if (feedback.layout.length > 0) {
    parts.push(
      `Layout after the bad cards were dropped:\n${feedback.layout.map((line) => `- ${line}`).join("\n")}`,
    );
  }
  if (feedback.reviewReasons.length > 0) {
    parts.push(
      `The reviewer's reasons:\n${feedback.reviewReasons.map((reason) => `- ${truncateValue(reason, 300)}`).join("\n")}`,
    );
  }
  parts.push("</previous-attempt>");
  return parts.join("\n");
}

/**
 * The propose call: the cards. With `feedback` (the retry) the previous
 * attempt and every mistake found in it are part of the system prompt, and
 * the task is to fix them — not to start over.
 */
export function buildProposePrompt(
  context: AssistantPromptContext,
  brief: DashboardBrief,
  feedback: ProposalFeedback | null,
): { system: string; prompt: string } {
  const system = [
    UNTRUSTED_DATA_RULE,
    WIDGET_GRAMMAR,
    CHART_SENSE_RULES,
    ...describeData({ ...context, scope: "dashboard" }),
    describeBrief(brief),
    ...(feedback ? [describeFeedback(feedback)] : []),
  ].join("\n\n");
  const task = `Propose the dashboard's cards for this sheet, as JSON: { "cards": [{ name, description, type, variant, height, column, query }] }.`;
  const retry = feedback
    ? "This is your second and last attempt. Fix every issue listed in <previous-attempt>: drop the cards marked to drop, replace or reconfigure every card with an error, keep the cards that had no issue exactly as they were, and fill the layout so every row sums to 12."
    : null;
  const prompt = [task, PROPOSE_RULES, retry, "Answer with the JSON only."]
    .filter((part): part is string => part !== null)
    .join(" ");
  return { system, prompt };
}

const REVIEW_SHAPE =
  '{ "pass": boolean, "reasons": string[], "cards": [{ "name": string, "verdict": "keep" | "fix" | "drop", "note"?: string }] }';

function describeReviewCards(cards: ReviewCard[]): string {
  if (cards.length === 0) return "(no cards survived the checks)";
  return cards
    .map((card) => {
      const rows = card.rows
        .slice(0, REVIEW_PREVIEW_ROWS)
        .map((row) => truncateValue(JSON.stringify(row), 200))
        .join("; ");
      return `- "${card.name}" (${card.description ?? "no description"}) ${card.type}/${card.variant}, width ${card.column}, row ${card.row}; query ${JSON.stringify(card.query)}; first computed rows: ${rows || "(none)"}`;
    })
    .join("\n");
}

/**
 * The review call: a demanding client judges the placed cards — value,
 * readability at their width, repetition, order — with the engine's findings
 * and the real computed rows in front of them.
 */
export function buildReviewPrompt(
  brief: DashboardBrief,
  cards: ReviewCard[],
  issues: VerifyIssue[],
  layout: string[],
): { system: string; prompt: string } {
  const system = [UNTRUSTED_DATA_RULE, describeBrief(brief)].join("\n\n");
  const findings =
    issues.length === 0
      ? "(none)"
      : issues
          .map(
            (issue) =>
              `- card ${issue.cardIndex} "${issue.cardName}": ${issue.severity} ${issue.code} — ${issue.message}`,
          )
          .join("\n");
  const rows =
    layout.length === 0
      ? "(empty)"
      : layout.map((line) => `- ${line}`).join("\n");
  const prompt = [
    "Review this dashboard as the demanding client who asked the brief's questions.",
    `<cards>\n${describeReviewCards(cards)}\n</cards>`,
    `Automatic checks already found:\n${findings}`,
    `Rows and the widths in them (each should sum to 12):\n${rows}`,
    "Judge: does every card give value and answer one of the brief's questions? Is the first row the key figures, then the trends, then the detail? Does every card read at its width (not too many categories, no long labels on an x-axis)? Is nothing repeated? Is a high-value question left unanswered while a low-value card is there?",
    `Answer as JSON: ${REVIEW_SHAPE}. pass is false when any card should be dropped or fixed, or when a high-value question is unanswered while a weaker card exists. reasons: the problems, one line each, most important first (empty when passing). Give every card a verdict. Answer with the JSON only.`,
  ].join("\n\n");
  return { system, prompt };
}
