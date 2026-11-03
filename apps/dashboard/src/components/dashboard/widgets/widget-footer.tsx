import type { WidgetData } from "@reclit/dashboard-engine";
import { cn } from "@reclit/ui/cn";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

/**
 * The line under a stat or chart. A compare `trend` (the engine writes
 * "<delta> <label>", e.g. "+12% vs last month") shows its delta as a tinted
 * chip with the trend icon — green up, red down — and the label beside it;
 * a plain footer is text with a pointer ("See analytics ›").
 */
export function WidgetFooter({
  footer,
  trend,
}: Pick<WidgetData, "footer" | "trend">) {
  if (!footer) return null;

  if (trend) {
    const Trend = trend === "down" ? TrendingDown : TrendingUp;
    const [delta, ...rest] = footer.split(" ");
    return (
      <p className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption",
            trend === "down"
              ? "bg-destructive/10 text-destructive"
              : "bg-success/10 text-success",
          )}
        >
          <Trend className="size-icon" />
          {delta}
        </span>
        {rest.length > 0 && <span>{rest.join(" ")}</span>}
      </p>
    );
  }

  return (
    <p className="flex items-center gap-2 text-caption text-muted-foreground">
      {footer}
      <ChevronRight className="size-icon" />
    </p>
  );
}
