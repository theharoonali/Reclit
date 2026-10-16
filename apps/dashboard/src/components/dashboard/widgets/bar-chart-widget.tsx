"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@reclit/ui/chart";
import { cn } from "@reclit/ui/cn";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toChartConfig, WIDGET_HEIGHT } from "@/lib/dashboard/layout";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";

/**
 * shadcn's bar chart. `default`: grouped bars; `stacked`: one bar per
 * category, series stacked; `horizontal`: bars run left → right with the
 * categories down the side.
 */
export function BarChartWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, height } = widget;
  const horizontal = variant === "horizontal";

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", WIDGET_HEIGHT[height])}
      config={toChartConfig(data.series)}
    >
      <BarChart
        accessibilityLayer
        data={data.rows}
        layout={horizontal ? "vertical" : "horizontal"}
      >
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          // Hidden axis: scale to the data, not to a rounded "nice" max, so
          // the longest bar spans the card.
          <XAxis domain={[0, "dataMax"]} hide type="number" />
        ) : (
          <XAxis
            axisLine={false}
            dataKey={data.categoryKey}
            tickLine={false}
            tickMargin={8}
          />
        )}
        {horizontal ? (
          <YAxis
            axisLine={false}
            dataKey={data.categoryKey}
            tickLine={false}
            type="category"
            width={88}
          />
        ) : (
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            width={32}
          />
        )}
        <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        {data.series.length > 1 && (
          <ChartLegend content={<ChartLegendContent />} />
        )}
        {data.series.map((series) => (
          <Bar
            dataKey={series.key}
            fill={`var(--color-${series.key})`}
            isAnimationActive={false}
            key={series.key}
            radius={4}
            stackId={variant === "stacked" ? "stack" : undefined}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
