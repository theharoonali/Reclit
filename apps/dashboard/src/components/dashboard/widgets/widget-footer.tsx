import type { WidgetData } from "@reclit/dashboard-engine";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

/**
 * The line under a stat or chart: a trend with its icon ("↗ +12% vs last
 * month"), or a plain pointer ("See analytics ›") when there is no trend.
 */
export function WidgetFooter({
  footer,
  trend,
}: Pick<WidgetData, "footer" | "trend">) {
  if (!footer) return null;
  const Trend = trend === "down" ? TrendingDown : TrendingUp;

  return (
    <p className="flex items-center gap-2 text-caption text-muted-foreground">
      {trend && (
        <Trend
          className={
            trend === "down"
              ? "size-icon text-destructive"
              : "size-icon text-chart-1"
          }
        />
      )}
      {footer}
      {!trend && <ChevronRight className="size-icon" />}
    </p>
  );
}
