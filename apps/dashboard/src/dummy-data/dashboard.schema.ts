import { z } from "zod";

/**
 * The one type a dashboard is described by (docs/plans/028-json-dashboard.md).
 * Every widget — chart, stat card, heatmap, table — is a `DashboardWidget`
 * with the same fields; `type` picks the renderer and `variant` its style.
 *
 * Placement: widgets sharing a `row` sit side by side in a 12-column grid,
 * left → right by `sort`; `column` is the span out of 12. Spans in a row add
 * up to at most 12 — whatever is left stays empty.
 *
 * `data` has one shape for every type:
 * - `rows` — the records. Values are strings, numbers or null.
 * - `categoryKey` — the field naming each record: the x-axis of area / bar /
 *   line / radar, the slice of pie / radial, the row label of a heatmap, the
 *   row id of a table.
 * - `series` — what is drawn from each record: chart series (area, bar, line,
 *   radar, stacked radial), the slices of pie / radial (keyed by the record's
 *   `categoryKey` value), heatmap columns, table columns, or a stat's
 *   secondary figures ("of 310").
 * - `valueKey` — the numeric field of pie / radial slices; a stat's headline.
 * - `footer`, `trend` — the line under a stat or chart ("10% of yesterday").
 *
 * Colours are chart token names (`chart-1` … `chart-5`), never raw colours.
 * Validation lives here so a malformed dashboard fails loudly, not blankly.
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

const seriesSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  color: z.enum(CHART_COLORS).optional(),
  /** Tables only. */
  kind: z.enum(COLUMN_KINDS).optional(),
  /** Tables only: a `person` column's second line (e.g. the role). */
  detailKey: z.string().min(1).optional(),
});

const dataSchema = z.object({
  categoryKey: z.string().min(1).optional(),
  valueKey: z.string().min(1).optional(),
  series: z.array(seriesSchema),
  rows: z.array(
    z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  ),
  footer: z.string().optional(),
  trend: z.enum(["up", "down"]).optional(),
});

/** Types whose `series` are fields of every record. */
const FIELD_SERIES: readonly WidgetType[] = [
  "area",
  "bar",
  "line",
  "radar",
  "heatmap",
  "table",
];
/** Types whose records are slices: `categoryKey` names them, `valueKey` sizes them. */
const SLICE_SERIES: readonly WidgetType[] = ["pie", "radial"];

const widgetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(WIDGET_TYPES),
    variant: z.string().default("default"),
    row: z.number().int().min(0),
    column: z.number().int().min(1).max(GRID_COLUMNS),
    sort: z.number().int().min(0),
    height: z.enum(WIDGET_HEIGHTS).default("md"),
    data: dataSchema,
  })
  .superRefine((widget, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });
    const { type, variant, data } = widget;
    const allowed: readonly string[] = WIDGET_VARIANTS[type];
    if (!allowed.includes(variant)) {
      issue(`"${variant}" is not a ${type} variant (${allowed.join(", ")})`, [
        "variant",
      ]);
    }

    const hasField = (key: string) => data.rows.some((row) => key in row);
    const requireField = (key: string | undefined, name: string) => {
      if (!key) issue(`${type} needs data.${name}`, ["data", name]);
      else if (!hasField(key)) {
        issue(`data.${name} "${key}" is in no row`, ["data", name]);
      }
    };

    // A stacked radial draws its series from one record, like a bar chart.
    const slices = SLICE_SERIES.includes(type) && variant !== "stacked";
    if (type === "stat") {
      if (data.rows.length === 0) issue("stat needs one row", ["data", "rows"]);
      requireField(data.valueKey, "valueKey");
    } else if (slices) {
      requireField(data.categoryKey, "categoryKey");
      requireField(data.valueKey, "valueKey");
      const names = new Set(
        data.rows.map((row) => String(row[data.categoryKey ?? ""])),
      );
      for (const [index, series] of data.series.entries()) {
        if (!names.has(series.key)) {
          issue(`slice "${series.key}" matches no row's category`, [
            "data",
            "series",
            index,
            "key",
          ]);
        }
      }
    } else {
      if (FIELD_SERIES.includes(type)) {
        requireField(data.categoryKey, "categoryKey");
      }
      for (const [index, series] of data.series.entries()) {
        if (!hasField(series.key)) {
          issue(`series "${series.key}" is in no row`, [
            "data",
            "series",
            index,
            "key",
          ]);
        }
      }
    }
  });

export const dashboardSchema = z
  .object({ widgets: z.array(widgetSchema) })
  .superRefine(({ widgets }, ctx) => {
    const ids = new Set<string>();
    const slots = new Set<string>();
    const spans = new Map<number, number>();
    for (const [index, widget] of widgets.entries()) {
      if (ids.has(widget.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate id "${widget.id}"`,
          path: ["widgets", index, "id"],
        });
      }
      ids.add(widget.id);

      const slot = `${widget.row}:${widget.sort}`;
      if (slots.has(slot)) {
        ctx.addIssue({
          code: "custom",
          message: `row ${widget.row} already has a widget at sort ${widget.sort}`,
          path: ["widgets", index, "sort"],
        });
      }
      slots.add(slot);

      const used = (spans.get(widget.row) ?? 0) + widget.column;
      spans.set(widget.row, used);
      if (used > GRID_COLUMNS) {
        ctx.addIssue({
          code: "custom",
          message: `row ${widget.row} spans ${used} of ${GRID_COLUMNS} columns`,
          path: ["widgets", index, "column"],
        });
      }
    }
  });

export type Dashboard = z.infer<typeof dashboardSchema>;
export type DashboardWidget = Dashboard["widgets"][number];
export type WidgetData = DashboardWidget["data"];
export type WidgetSeries = WidgetData["series"][number];
export type WidgetRecord = WidgetData["rows"][number];
