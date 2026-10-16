import { cn } from "@reclit/ui/cn";
import { HEAT_CLASSES, heatLevel, WIDGET_HEIGHT } from "@/lib/dashboard/layout";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";

/**
 * A grid of tinted cells: one line per record (labelled by `categoryKey`),
 * one cell per series, darker for a higher value relative to the widget's
 * largest. Each cell names its value for hover and screen readers.
 */
export function HeatmapWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, height } = widget;
  const categoryKey = data.categoryKey ?? "";
  const max = Math.max(
    0,
    ...data.rows.flatMap((record) =>
      data.series.map((series) => Number(record[series.key]) || 0),
    ),
  );

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
                    HEAT_CLASSES[series.color ?? "chart-1"][
                      heatLevel(value, max || 100)
                    ],
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
