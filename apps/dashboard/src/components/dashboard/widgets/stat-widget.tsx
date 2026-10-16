import { formatFigure } from "@/lib/dashboard/format";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";
import { WidgetFooter } from "./widget-footer";

/**
 * A KPI card body. `default`: the headline figure (`valueKey`) with each
 * other series as a smaller figure beside it ("233 of 310"). `text`: the
 * headline is a sentence. Both end in the footer — a stat's `compare`
 * figure arrives as the footer's trend line.
 */
export function StatWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, name } = widget;
  const record = data.rows[0] ?? {};
  const valueKey = data.valueKey ?? "";
  const headline = formatFigure(
    record[valueKey],
    data.series.find((series) => series.key === valueKey),
  );
  const secondary = data.series.filter((series) => series.key !== valueKey);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <p className="flex items-center gap-2 text-label">
        {variant === "text" && (
          <span className="size-2 rounded-full bg-chart-1" />
        )}
        {name}
      </p>
      {variant === "text" ? (
        <p className="flex-1 text-subheading">{headline}</p>
      ) : (
        <p className="flex flex-1 items-baseline gap-2">
          <span className="text-display">{headline}</span>
          {secondary.map((series) => (
            <span
              className="text-muted-foreground text-subtitle"
              key={series.key}
            >
              {series.label} {formatFigure(record[series.key], series)}
            </span>
          ))}
        </p>
      )}
      <WidgetFooter footer={data.footer} trend={data.trend} />
    </div>
  );
}
