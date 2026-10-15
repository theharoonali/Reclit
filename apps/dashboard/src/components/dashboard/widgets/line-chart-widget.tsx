"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@reclit/ui/chart";
import { cn } from "@reclit/ui/cn";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { DashboardWidget } from "@/dummy-data/dashboard.schema";
import { toChartConfig, WIDGET_HEIGHT } from "@/lib/dashboard/layout";

/**
 * shadcn's line chart. `default`: smooth lines; `dots`: a dot on every
 * point; `step`: stepped lines for counts that jump.
 */
export function LineChartWidget({ widget }: { widget: DashboardWidget }) {
  const { data, variant, height } = widget;

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", WIDGET_HEIGHT[height])}
      config={toChartConfig(data.series)}
    >
      <LineChart accessibilityLayer data={data.rows}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey={data.categoryKey}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis axisLine={false} tickLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        {data.series.length > 1 && (
          <ChartLegend content={<ChartLegendContent />} />
        )}
        {data.series.map((series) => (
          <Line
            dataKey={series.key}
            dot={
              variant === "dots"
                ? { fill: `var(--color-${series.key})`, r: 4 }
                : false
            }
            isAnimationActive={false}
            key={series.key}
            stroke={`var(--color-${series.key})`}
            strokeWidth={2}
            type={variant === "step" ? "step" : "monotone"}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
