import type {
  ChartColor,
  DashboardWidget,
  WidgetHeight,
  WidgetSeries,
} from "@/dummy-data/dashboard.schema";

/** One dashboard row: its index and its widgets, left → right. */
export type DashboardRow = { row: number; widgets: DashboardWidget[] };

/**
 * Groups widgets into rows (ascending `row`) and orders each row by `sort`.
 * Rows are rendered independently, so a row whose spans total less than 12
 * keeps its trailing columns empty instead of pulling up the next row.
 */
export function toRows(widgets: DashboardWidget[]): DashboardRow[] {
  const byRow = new Map<number, DashboardWidget[]>();
  for (const widget of widgets) {
    byRow.set(widget.row, [...(byRow.get(widget.row) ?? []), widget]);
  }
  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, items]) => ({
      row,
      widgets: [...items].sort((a, b) => a.sort - b.sort),
    }));
}

/**
 * `column` → its span class. Static because Tailwind only emits classes it can
 * read in source; below `lg` every widget is full width.
 */
export const COLUMN_SPAN: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  10: "lg:col-span-10",
  11: "lg:col-span-11",
  12: "lg:col-span-12",
};

/** `height` → the chart body's height token. */
export const WIDGET_HEIGHT: Record<WidgetHeight, string> = {
  sm: "h-chart-sm",
  md: "h-chart-md",
  lg: "h-chart-lg",
};

/** A chart token as a CSS colour, for recharts and the chart config. */
export const chartColor = (color: ChartColor = "chart-1") =>
  `hsl(var(--${color}))`;

/**
 * The shadcn `ChartConfig` for a widget: each series key → its label and
 * colour. `ChartContainer` exposes them as `var(--color-<key>)`.
 */
export function toChartConfig(
  series: WidgetSeries[],
): Record<string, { label: string; color: string }> {
  return Object.fromEntries(
    series.map((item) => [
      item.key,
      { label: item.label, color: chartColor(item.color) },
    ]),
  );
}

/**
 * Heatmap cell fills: five intensity steps per chart colour, spelled out so
 * Tailwind emits them.
 */
export const HEAT_CLASSES: Record<ChartColor, readonly string[]> = {
  "chart-1": [
    "bg-chart-1/10",
    "bg-chart-1/25",
    "bg-chart-1/45",
    "bg-chart-1/70",
    "bg-chart-1",
  ],
  "chart-2": [
    "bg-chart-2/10",
    "bg-chart-2/25",
    "bg-chart-2/45",
    "bg-chart-2/70",
    "bg-chart-2",
  ],
  "chart-3": [
    "bg-chart-3/10",
    "bg-chart-3/25",
    "bg-chart-3/45",
    "bg-chart-3/70",
    "bg-chart-3",
  ],
  "chart-4": [
    "bg-chart-4/10",
    "bg-chart-4/25",
    "bg-chart-4/45",
    "bg-chart-4/70",
    "bg-chart-4",
  ],
  "chart-5": [
    "bg-chart-5/10",
    "bg-chart-5/25",
    "bg-chart-5/45",
    "bg-chart-5/70",
    "bg-chart-5",
  ],
};

/** A 0–100 heatmap value → one of five intensity steps (0–4). */
export function heatLevel(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(4, Math.floor(n / 20));
}
