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
import {
  axisWidthFor,
  CATEGORY_AXIS_MAX_PX,
  compactFigure,
  MAX_CATEGORY_CHARS,
  MAX_LEGEND_CHARS,
  seriesValues,
  tickPolicy,
  tooltipCategory,
  truncateLabel,
  valueAxisWidth,
} from "@/lib/dashboard/axis";
import { figureFormatter } from "@/lib/dashboard/format";
import { toChartConfig, WIDGET_HEIGHT } from "@/lib/dashboard/layout";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";

/**
 * shadcn's bar chart. `default`: grouped bars; `stacked`: one bar per
 * category, series stacked; `horizontal`: bars run left → right with the
 * categories down the side. A `default` or `stacked` chart also turns
 * horizontal when its categories would not fit along the bottom
 * (`tickPolicy`); along the bottom, long or many labels slant and truncate,
 * and the tooltip names the full category.
 */
export function BarChartWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, height, column } = widget;
  const categoryKey = data.categoryKey ?? "";
  const labels = data.rows.map((record) => String(record[categoryKey] ?? ""));
  const policy = tickPolicy(labels, column);
  const ticks = policy.orientation === "vertical" ? policy : null;
  const horizontal = variant === "horizontal" || !ticks;
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
      <BarChart
        accessibilityLayer
        data={data.rows}
        layout={horizontal ? "vertical" : "horizontal"}
      >
        <CartesianGrid horizontal={!horizontal} vertical={horizontal} />
        {horizontal || !ticks ? (
          <XAxis
            allowDecimals={false}
            axisLine={false}
            tickFormatter={compactFigure}
            tickLine={false}
            type="number"
          />
        ) : (
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
        )}
        {horizontal ? (
          <YAxis
            axisLine={false}
            dataKey={categoryKey}
            tickFormatter={(label) =>
              truncateLabel(String(label), MAX_CATEGORY_CHARS)
            }
            tickLine={false}
            type="category"
            width={axisWidthFor(labels, { max: CATEGORY_AXIS_MAX_PX })}
          />
        ) : (
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickFormatter={compactFigure}
            tickLine={false}
            width={valueWidth}
          />
        )}
        <ChartTooltip
          content={
            <ChartTooltipContent
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
