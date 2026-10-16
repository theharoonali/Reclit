import type { ColumnMeta } from "@reclit/dashboard-engine";
import type { WidgetInput } from "./dashboard.schema";

// The starter dashboard: a few widgets derived from a sheet's columns, so a
// workspace has something to look at before anything (or anyone) has
// written a real one. Pure — the service hands in the columns. It doubles as
// a worked example of the config an LLM writes.

/** `WidgetInput` with the schema's defaults optional. */
type StarterWidget = Omit<
  WidgetInput,
  "description" | "variant" | "height" | "query"
> & {
  description?: string | null;
  variant?: string;
  height?: WidgetInput["height"];
  query: Omit<WidgetInput["query"], "filters" | "groupBy"> & {
    filters?: WidgetInput["query"]["filters"];
    groupBy?: WidgetInput["query"]["groupBy"];
  };
};

const widget = (input: StarterWidget): WidgetInput => ({
  description: null,
  variant: "default",
  height: "md",
  ...input,
  query: { filters: [], groupBy: null, ...input.query },
});

const ref = (column: ColumnMeta) => `{${column.name}}`;

/** A column a formula can name: braces would end the reference early. */
const referable = (column: ColumnMeta) =>
  !column.name.includes("{") && !column.name.includes("}");

export function buildStarterWidgets(columns: ColumnMeta[]): WidgetInput[] {
  const usable = columns.filter(referable);
  const numbers = usable.filter((column) => column.type === "number");
  const measure = numbers[0];
  const category = usable.find((column) => column.type === "string");
  const date = usable.find((column) => column.type === "date");
  const widgets: WidgetInput[] = [];

  // Row 0: a KPI per number column, after the row count.
  const stats = [
    { name: "Rows", formula: "COUNT()" },
    ...numbers.slice(0, 3).map((column) => ({
      name: `Total ${column.name}`,
      formula: `SUM(${ref(column)})`,
    })),
  ];
  const statSpan = stats.length <= 2 ? 6 : stats.length === 3 ? 4 : 3;
  stats.forEach((stat, sort) => {
    widgets.push(
      widget({
        name: stat.name,
        type: "stat",
        row: 0,
        column: statSpan,
        sort,
        height: "sm",
        query: {
          series: [{ key: "value", label: stat.name, formula: stat.formula }],
        },
      }),
    );
  });

  // Row 1: the measure by category, and by month when there is a date.
  const series = measure
    ? {
        key: "value",
        label: `Total ${measure.name}`,
        formula: `SUM(${ref(measure)})`,
      }
    : { key: "value", label: "Rows", formula: "COUNT()" };
  const charts: WidgetInput[] = [];
  if (category) {
    charts.push(
      widget({
        name: `${series.label} by ${category.name}`,
        type: "bar",
        row: 1,
        column: 12,
        sort: 0,
        query: {
          groupBy: { column: category.name, bucket: "none" },
          series: [series],
          limit: 8,
        },
      }),
    );
  }
  if (date) {
    charts.push(
      widget({
        name: `${series.label} by month`,
        type: "line",
        variant: "dots",
        row: 1,
        column: 12,
        sort: charts.length,
        query: {
          filters: [{ column: date.name, op: "notEmpty" }],
          groupBy: { column: date.name, bucket: "month" },
          series: [series],
        },
      }),
    );
  }
  for (const chart of charts) {
    widgets.push({ ...chart, column: charts.length === 2 ? 6 : 12 });
  }

  // Row 2: the first columns of the latest rows.
  const shown = usable.slice(0, 6);
  if (shown.length > 0) {
    widgets.push(
      widget({
        name: "Latest rows",
        type: "table",
        row: 2,
        column: 12,
        sort: 0,
        query: {
          series: shown.map((column, index) => ({
            key: `c${index}`,
            label: column.name,
            formula: ref(column),
            kind: column.type === "number" ? "number" : "text",
          })),
          sort: { by: "category", direction: "desc" },
          limit: 10,
        },
      }),
    );
  }

  return widgets;
}
