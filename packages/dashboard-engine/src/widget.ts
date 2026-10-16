/**
 * The dashboard vocabulary: what a widget *is* (type, variant, placement) and
 * what it *asks* of a sheet (`WidgetQuery`). The API stores and validates the
 * query; the browser runs it. Both import these names, so the two never
 * disagree on a type, a bucket or a filter operator.
 *
 * `WidgetData` is the engine's output and the renderers' input — the same
 * shape plan 028's JSON carried inline, kept so the nine widget components
 * stay untouched.
 */

export const WIDGET_TYPES = [
  "stat",
  "area",
  "bar",
  "line",
  "pie",
  "radar",
  "radial",
  "heatmap",
  "table",
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** The variants each type understands; `default` is valid everywhere. */
export const WIDGET_VARIANTS = {
  stat: ["default", "text"],
  area: ["default", "stacked", "gradient"],
  bar: ["default", "stacked", "horizontal"],
  line: ["default", "dots", "step"],
  pie: ["default", "donut", "label"],
  radar: ["default", "dots"],
  radial: ["default", "stacked", "text"],
  heatmap: ["default"],
  table: ["default"],
} as const satisfies Record<WidgetType, readonly string[]>;

export const CHART_COLORS = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;
export type ChartColor = (typeof CHART_COLORS)[number];

export const WIDGET_HEIGHTS = ["sm", "md", "lg"] as const;
export type WidgetHeight = (typeof WIDGET_HEIGHTS)[number];

/** Columns in a dashboard row. */
export const GRID_COLUMNS = 12;

/** How a table column renders its cell. */
export const COLUMN_KINDS = ["text", "number", "person", "action"] as const;
export type ColumnKind = (typeof COLUMN_KINDS)[number];

export const FILTER_OPS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "in",
  "isEmpty",
  "notEmpty",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

/** Date buckets for a `groupBy` / `splitBy` on a date column. */
export const BUCKETS = [
  "none",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;
export type Bucket = (typeof BUCKETS)[number];

/**
 * A series key becomes a CSS custom property (`--color-<key>`) in the chart
 * primitive and a record field, so it is an identifier, never free text.
 */
export const SERIES_KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Record fields the engine mints; a series may not take them. */
export const CATEGORY_KEY = "category";
export const VALUE_KEY = "value";
export const ROW_ID_KEY = "id";
export const TOTAL_KEY = "total";
export const RESERVED_SERIES_KEYS: readonly string[] = [
  CATEGORY_KEY,
  ROW_ID_KEY,
  TOTAL_KEY,
];

/** The label a blank category groups under. */
export const EMPTY_CATEGORY_LABEL = "(empty)";

export const DEFAULT_GROUP_LIMIT = 20;
export const MAX_GROUP_LIMIT = 500;
export const DEFAULT_TABLE_LIMIT = 50;
export const DEFAULT_SPLIT_LIMIT = 5;
export const MAX_SPLIT_LIMIT = 10;
export const MAX_SERIES = 10;

/* ------------------------------------------------------------------ query */

export type FilterValue = string | number | boolean | (string | number)[];

export type WidgetFilter = {
  column: string;
  op: FilterOp;
  /** Absent for `isEmpty` / `notEmpty`; an array only for `in`. */
  value?: FilterValue;
};

/** The x-axis of a chart, the slices of a pie, the groups of a table. */
export type WidgetGroupBy = { column: string; bucket: Bucket };

/** A pivot: each distinct value of `column` becomes its own series. */
export type WidgetSplitBy = { column: string; bucket?: Bucket; limit?: number };

/** A y-axis, a KPI, or a table column — `formula` is what it computes. */
export type WidgetSeriesSpec = {
  key: string;
  label: string;
  formula: string;
  color?: ChartColor;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Tables only. */
  kind?: ColumnKind;
  /** Tables only: a `person` column's second line, another series' key. */
  detailKey?: string;
};

/** `by` is `"category"`, `"total"` (pivots only) or a series key. */
export type WidgetSort = { by: string; direction: "asc" | "desc" };

/** Stat only: the figure the headline is compared with ("+12% vs last month"). */
export type WidgetCompare = { formula: string; label: string };

export type WidgetQuery = {
  filters: WidgetFilter[];
  groupBy: WidgetGroupBy | null;
  splitBy?: WidgetSplitBy;
  series: WidgetSeriesSpec[];
  sort?: WidgetSort;
  limit?: number;
  compare?: WidgetCompare;
  /** Non-stat widgets: the line under the chart, verbatim. */
  footer?: string;
};

/** What the engine needs from a stored widget; the API's record satisfies it. */
export type WidgetSpec = {
  type: WidgetType;
  variant: string;
  query: WidgetQuery;
};

/* ----------------------------------------------------------------- output */

export type WidgetValue = string | number | null;
export type WidgetRecord = Record<string, WidgetValue>;

export type WidgetSeries = {
  key: string;
  label: string;
  color?: ChartColor;
  prefix?: string;
  suffix?: string;
  kind?: ColumnKind;
  detailKey?: string;
};

export type WidgetData = {
  categoryKey?: string;
  valueKey?: string;
  series: WidgetSeries[];
  rows: WidgetRecord[];
  footer?: string;
  trend?: "up" | "down";
};

export type QueryIssueCode =
  | "UNKNOWN_COLUMN"
  | "FORMULA_INVALID"
  | "VARIANT"
  | "GROUP_BY_REQUIRED"
  | "GROUP_BY_FORBIDDEN"
  | "SPLIT_BY_FORBIDDEN"
  | "SERIES_COUNT"
  | "SERIES_KEY"
  | "AGGREGATE_REQUIRED"
  | "ROW_LEVEL_REQUIRED"
  | "BUCKET_NOT_DATE"
  | "SORT_KEY"
  | "DETAIL_KEY"
  | "COMPARE_FORBIDDEN";

export type QueryIssue = {
  code: QueryIssueCode;
  /** Where in the query, e.g. `["series", 0, "formula"]`. */
  path: (string | number)[];
  message: string;
  /** The column name or the formula error, for the caller's own message. */
  detail?: string;
};

export type WidgetResult =
  | { ok: true; data: WidgetData }
  | { ok: false; issues: QueryIssue[] };
