import type { RouterInputs } from "@reclit/api/trpc/routers/_app";
import {
  type Bucket,
  type ColumnMeta,
  GRID_COLUMNS,
  placeWidgets,
  type QueryIssue,
  RESERVED_SERIES_KEYS,
  SERIES_KEY_RE,
  tryParseFormula,
  validateWidget,
  WIDGET_VARIANTS,
  type WidgetType,
} from "@reclit/dashboard-engine";
import type { AssistantRecommendation } from "@/lib/dashboard/widget-state";

/**
 * The cards step's draft list: the assistant's proposals as editable configs
 * (type, x axis, y formulas) checked with the engine against the sheet's
 * columns, and turned into the `dashboard.replace` input with their slots
 * placed top-first. Pure — the hook holds the state, these shape it.
 */
export type WidgetDraft = AssistantRecommendation & { key: string };

export type WidgetDraftSeries = WidgetDraft["query"]["series"][number];

type ReplaceInput = RouterInputs["dashboard"]["replace"];
export type WidgetInput = ReplaceInput["widgets"][number];

/** The width a card of this type takes — the assistant's own defaults. */
export function defaultSpan(type: WidgetType): number {
  if (type === "stat") return 3;
  if (type === "table") return GRID_COLUMNS;
  return 6;
}

/** The assistant's proposals as drafts; `seed` keeps keys unique across re-runs. */
export function fromRecommendations(
  recommendations: readonly AssistantRecommendation[],
  seed = 0,
): WidgetDraft[] {
  return recommendations.map((card, index) => ({
    ...card,
    key: `card-${seed}-${index}`,
  }));
}

/** A card to start from: a row count by the first text column, or a plain row count. */
export function newWidgetDraft(
  columns: readonly ColumnMeta[],
  key: string,
  name: string,
): WidgetDraft {
  const axis = columns.find((column) => column.type === "string") ?? null;
  const type: WidgetType = axis ? "bar" : "stat";
  return {
    key,
    name,
    description: null,
    type,
    variant: "default",
    height: "md",
    column: defaultSpan(type),
    query: {
      filters: [],
      groupBy: axis ? { column: axis.name, bucket: "none" } : null,
      series: [{ key: "count", label: "Rows", formula: "COUNT()" }],
    },
  };
}

/** Retypes a card: the variant resets, the width follows the type, a stat loses its axis. */
export function setType(draft: WidgetDraft, type: WidgetType): WidgetDraft {
  return {
    ...draft,
    type,
    variant: "default",
    column: defaultSpan(type),
    query: type === "stat" ? { ...draft.query, groupBy: null } : draft.query,
  };
}

export function setGroupBy(
  draft: WidgetDraft,
  column: string | null,
  bucket: Bucket = "none",
): WidgetDraft {
  return {
    ...draft,
    query: { ...draft.query, groupBy: column ? { column, bucket } : null },
  };
}

export function updateSeries(
  draft: WidgetDraft,
  key: string,
  patch: Partial<Pick<WidgetDraftSeries, "label" | "formula">>,
): WidgetDraft {
  return {
    ...draft,
    query: {
      ...draft.query,
      series: draft.query.series.map((series) =>
        series.key === key ? { ...series, ...patch } : series,
      ),
    },
  };
}

/** A key from the label that the chart primitive accepts, unique within the card. */
function seriesKeyFor(label: string, taken: readonly string[]): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/[_-]+$/, "");
  let key = base !== "" && SERIES_KEY_RE.test(base) ? base : "series";
  if (RESERVED_SERIES_KEYS.includes(key)) key = `${key}_1`;
  let candidate = key;
  for (let n = 2; taken.includes(candidate); n += 1) candidate = `${key}_${n}`;
  return candidate;
}

export function addSeries(draft: WidgetDraft, label: string): WidgetDraft {
  const taken = draft.query.series.map((series) => series.key);
  return {
    ...draft,
    query: {
      ...draft.query,
      series: [
        ...draft.query.series,
        { key: seriesKeyFor(label, taken), label, formula: "COUNT()" },
      ],
    },
  };
}

/** Removes a series; the last one stays (every card needs one). */
export function removeSeries(draft: WidgetDraft, key: string): WidgetDraft {
  if (draft.query.series.length <= 1) return draft;
  return {
    ...draft,
    query: {
      ...draft.query,
      series: draft.query.series.filter((series) => series.key !== key),
    },
  };
}

export const variantsFor = (type: WidgetType): readonly string[] =>
  WIDGET_VARIANTS[type];

/** The engine's verdict on a draft against the sheet's columns. */
export function widgetDraftIssues(
  draft: WidgetDraft,
  columns: readonly ColumnMeta[],
): QueryIssue[] {
  return validateWidget(
    { type: draft.type, variant: draft.variant, query: draft.query },
    columns,
  );
}

export function isFormulaValid(formula: string): boolean {
  return formula.trim() !== "" && tryParseFormula(formula).ok;
}

/** The drafts as `dashboard.replace` takes them, placed top-first like the api would. */
export function toWidgetInputs(
  drafts: readonly WidgetDraft[],
  spreadsheetId: string,
): WidgetInput[] {
  const slots = placeWidgets(drafts.map((draft) => draft.column));
  return drafts.map(({ key: _key, ...card }, index) => ({
    spreadsheetId,
    ...card,
    row: slots[index]?.row ?? 0,
    sort: slots[index]?.sort ?? index,
  }));
}
