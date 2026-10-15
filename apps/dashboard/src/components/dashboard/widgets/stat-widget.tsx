import type { DashboardWidget } from "@/dummy-data/dashboard.schema";
import { WidgetFooter } from "./widget-footer";

const format = (value: string | number | null | undefined) =>
  typeof value === "number" ? value.toLocaleString() : (value ?? "");

/**
 * A KPI card body. `default`: the headline figure (`valueKey`) with each
 * series as a smaller figure beside it ("233 of 310"). `text`: the headline
 * is a sentence (the "Update" card). Both end in the footer.
 */
export function StatWidget({ widget }: { widget: DashboardWidget }) {
  const { data, variant, name } = widget;
  const record = data.rows[0] ?? {};
  const headline = format(record[data.valueKey ?? ""]);

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
          {data.series.map((series) => (
            <span
              className="text-subtitle text-muted-foreground"
              key={series.key}
            >
              {series.label} {format(record[series.key])}
            </span>
          ))}
        </p>
      )}
      <WidgetFooter footer={data.footer} trend={data.trend} />
    </div>
  );
}
