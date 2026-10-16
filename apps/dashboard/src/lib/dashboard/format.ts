import type { WidgetSeries, WidgetValue } from "@reclit/dashboard-engine";

/**
 * A figure as a stat or table cell shows it: the number localised, wrapped
 * in its series' `prefix` / `suffix` ("$53,111", "57%"). Blank stays blank.
 */
export function formatFigure(
  value: WidgetValue | undefined,
  series?: Pick<WidgetSeries, "prefix" | "suffix">,
): string {
  if (value === null || value === undefined || value === "") return "";
  const text = typeof value === "number" ? value.toLocaleString() : value;
  return `${series?.prefix ?? ""}${text}${series?.suffix ?? ""}`;
}
