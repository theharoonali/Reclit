"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@reclit/ui/chart";
import { cn } from "@reclit/ui/cn";
import { Pie, PieChart } from "recharts";
import {
  MAX_LEGEND_CHARS,
  MAX_LEGEND_ITEMS,
  truncateLabel,
} from "@/lib/dashboard/axis";
import { figureFormatter } from "@/lib/dashboard/format";
import { toChartConfig, WIDGET_HEIGHT } from "@/lib/dashboard/layout";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";

/**
 * shadcn's pie chart. Each record is a slice: `categoryKey` names it (and
 * picks its series colour), `valueKey` sizes it. `donut` hollows the centre;
 * `label` prints each slice's value on it. Past `MAX_LEGEND_ITEMS` slices
 * the legend and the labels go — the tooltip names each slice.
 */
export function PieChartWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, height } = widget;
  const categoryKey = data.categoryKey ?? "";
  const slices = data.rows.map((record) => ({
    ...record,
    fill: `var(--color-${record[categoryKey]})`,
  }));
  const annotated = data.rows.length <= MAX_LEGEND_ITEMS;

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", WIDGET_HEIGHT[height])}
      config={toChartConfig(data.series)}
    >
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              nameKey={categoryKey}
              valueFormatter={figureFormatter(data.series)}
            />
          }
          cursor={false}
        />
        <Pie
          data={slices}
          dataKey={data.valueKey ?? ""}
          innerRadius={variant === "donut" ? "55%" : 0}
          isAnimationActive={false}
          label={variant === "label" && annotated}
          nameKey={categoryKey}
          strokeWidth={2}
        />
        {annotated && (
          <ChartLegend
            content={
              <ChartLegendContent
                formatter={(label) => truncateLabel(label, MAX_LEGEND_CHARS)}
                nameKey={categoryKey}
              />
            }
          />
        )}
      </PieChart>
    </ChartContainer>
  );
}
