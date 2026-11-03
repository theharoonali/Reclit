import type { WidgetSeries, WidgetValue } from "@reclit/dashboard-engine";
import { compactFigure } from "./axis";

/** A stat headline this large or larger is abbreviated; the full figure stays in its `title`. */
export const COMPACT_HEADLINE_FROM = 100_000;

/**
 * A figure as a stat or table cell shows it: the number localised, wrapped
 * in its series' `prefix` / `suffix` ("$53,111", "57%"). `compact` abbreviates
 * the number instead ("$53.1K") for a headline or an axis. Blank stays blank.
 */
export function formatFigure(
  value: WidgetValue | undefined,
  series?: Pick<WidgetSeries, "prefix" | "suffix">,
  opts?: { compact?: boolean },
): string {
  if (value === null || value === undefined || value === "") return "";
  const text =
    typeof value === "number"
      ? opts?.compact
        ? compactFigure(value)
        : value.toLocaleString()
      : value;
  return `${series?.prefix ?? ""}${text}${series?.suffix ?? ""}`;
}

/** The widget's series by key, for a lookup per tooltip row or table cell. */
export function seriesByKey(
  series: readonly WidgetSeries[],
): Map<string, WidgetSeries> {
  return new Map(series.map((item) => [item.key, item]));
}

/**
 * The tooltip's value column: each figure with its own series' prefix and
 * suffix — `ChartTooltipContent`'s `valueFormatter`.
 */
export function figureFormatter(series: readonly WidgetSeries[]) {
  const byKey = seriesByKey(series);
  return (value: number | string, key: string): string =>
    formatFigure(value, byKey.get(key));
}
