import { COMPACT_HEADLINE_FROM, formatFigure } from "@/lib/dashboard/format";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";
import { WidgetFooter } from "./widget-footer";

/**
 * A KPI card body. `default`: the headline figure (`valueKey`) with each
 * other series as a smaller figure beside it ("233 of 310"), wrapping under
 * it on a narrow card; a headline from `COMPACT_HEADLINE_FROM` up is
 * abbreviated ("1.2M") with the full figure on hover. `text`: the headline
 * is a sentence. Both end in the footer — a stat's `compare` figure arrives
 * as the footer's trend chip. The body fills the card, so a stat sharing a
 * row with a chart centres its figure in the same height.
 */
export function StatWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, name } = widget;
  const record = data.rows[0] ?? {};
  const valueKey = data.valueKey ?? "";
  const value = record[valueKey];
  const valueSeries = data.series.find((series) => series.key === valueKey);
  const compact =
    typeof value === "number" && Math.abs(value) >= COMPACT_HEADLINE_FROM;
  const headline = formatFigure(value, valueSeries, { compact });
  const secondary = data.series.filter((series) => series.key !== valueKey);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <p className="flex items-center gap-2 text-label">
        {variant === "text" && (
          <span className="size-2 shrink-0 rounded-full bg-chart-1" />
        )}
        {name}
      </p>
      {variant === "text" ? (
        <p className="flex flex-1 items-center text-subheading">{headline}</p>
      ) : (
        <p className="flex flex-1 flex-wrap content-center items-baseline gap-x-3 gap-y-1">
          <span
            className="text-display tabular-nums"
            title={compact ? formatFigure(value, valueSeries) : undefined}
          >
            {headline}
          </span>
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
