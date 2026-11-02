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
import {
  compactFigure,
  MAX_LEGEND_CHARS,
  seriesValues,
  tickLayout,
  tooltipCategory,
  truncateLabel,
  valueAxisWidth,
} from "@/lib/dashboard/axis";
import { figureFormatter } from "@/lib/dashboard/format";
import { toChartConfig, WIDGET_HEIGHT } from "@/lib/dashboard/layout";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";

/**
 * shadcn's area chart. `default`: overlapping translucent areas; `stacked`:
 * series stacked on each other; `gradient`: each area fades out downwards.
 * Long or many category labels slant, truncate and thin out (`tickLayout`);
 * the value axis takes compact figures at the width they need.
 */
export function AreaChartWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, height } = widget;
  // Gradient ids are document-global; scope them to this chart.
  const gradientId = useId().replace(/:/g, "");
  const categoryKey = data.categoryKey ?? "";
  const ticks = tickLayout(
    data.rows.map((record) => String(record[categoryKey] ?? "")),
  );
  const valueWidth = valueAxisWidth(
    seriesValues(
      data.rows,
      data.series.map((series) => series.key),
      { stacked: variant === "stacked" },
    ),
  );

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
          angle={ticks.angle}
          axisLine={false}
          dataKey={categoryKey}
          height={ticks.height}
          interval={ticks.interval}
          textAnchor={ticks.angle ? "end" : "middle"}
          tickFormatter={(label) =>
            truncateLabel(String(label), ticks.maxChars)
          }
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          allowDecimals={false}
          axisLine={false}
          tickFormatter={compactFigure}
          tickLine={false}
          width={valueWidth}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={tooltipCategory(categoryKey)}
              valueFormatter={figureFormatter(data.series)}
            />
          }
          cursor={false}
        />
        {data.series.length > 1 && (
          <ChartLegend
            content={
              <ChartLegendContent
                formatter={(label) => truncateLabel(label, MAX_LEGEND_CHARS)}
              />
            }
          />
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
