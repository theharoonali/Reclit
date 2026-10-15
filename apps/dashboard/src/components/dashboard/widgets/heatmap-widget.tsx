import { cn } from "@reclit/ui/cn";
import type { DashboardWidget } from "@/dummy-data/dashboard.schema";
import { HEAT_CLASSES, heatLevel, WIDGET_HEIGHT } from "@/lib/dashboard/layout";

/**
 * A grid of tinted cells: one line per record (labelled by `categoryKey`),
 * one cell per series, darker for a higher 0–100 value. Each cell names its
 * value for hover and screen readers.
 */
export function HeatmapWidget({ widget }: { widget: DashboardWidget }) {
  const { data, height } = widget;
  const categoryKey = data.categoryKey ?? "";

  return (
    <div className={cn("flex flex-col gap-2", WIDGET_HEIGHT[height])}>
      {data.rows.map((record, index) => {
        const label = String(record[categoryKey] ?? "");
        return (
          <div
            className="flex flex-1 items-center gap-2"
            key={`${label}-${index}`}
          >
            <span className="w-16 shrink-0 text-caption text-muted-foreground">
              {label}
            </span>
            {data.series.map((series) => {
              const value = record[series.key];
              const text = `${label}, ${series.label}: ${value ?? 0}`;
              return (
                <span
                  aria-label={text}
                  className={cn(
                    "h-full flex-1 rounded-sm",
                    HEAT_CLASSES[series.color ?? "chart-1"][heatLevel(value)],
                  )}
                  key={series.key}
                  role="img"
                  title={text}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
