"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@reclit/ui/chart";
import { cn } from "@reclit/ui/cn";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toChartConfig, WIDGET_HEIGHT } from "@/lib/dashboard/layout";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";

/**
 * shadcn's area chart. `default`: overlapping translucent areas; `stacked`:
 * series stacked on each other; `gradient`: each area fades out downwards.
 */
export function AreaChartWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, height } = widget;
  // Gradient ids are document-global; scope them to this chart.
  const gradientId = useId().replace(/:/g, "");

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", WIDGET_HEIGHT[height])}
      config={toChartConfig(data.series)}
    >
      <AreaChart accessibilityLayer data={data.rows}>
        {variant === "gradient" && (
          <defs>
            {data.series.map((series) => (
              <linearGradient
                id={`${gradientId}-${series.key}`}
                key={series.key}
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor={`var(--color-${series.key})`}
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor={`var(--color-${series.key})`}
                  stopOpacity={0.1}
                />
              </linearGradient>
            ))}
          </defs>
        )}
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey={data.categoryKey}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <ChartTooltip
          content={<ChartTooltipContent indicator="line" />}
          cursor={false}
        />
        {data.series.length > 1 && (
          <ChartLegend content={<ChartLegendContent />} />
        )}
        {data.series.map((series) => (
          <Area
            dataKey={series.key}
            fill={
              variant === "gradient"
                ? `url(#${gradientId}-${series.key})`
                : `var(--color-${series.key})`
            }
            fillOpacity={variant === "gradient" ? 1 : 0.4}
            isAnimationActive={false}
            key={series.key}
            stackId={variant === "stacked" ? "stack" : undefined}
            stroke={`var(--color-${series.key})`}
            type="natural"
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
