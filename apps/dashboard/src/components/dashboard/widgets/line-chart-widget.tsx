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
 * shadcn's line chart. `default`: smooth lines; `dots`: a dot on every
 * point; `step`: stepped lines for counts that jump. Long or many category
 * labels slant, truncate and thin out (`tickLayout`); the value axis takes
 * compact figures at the width they need.
 */
export function LineChartWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, height } = widget;
  const categoryKey = data.categoryKey ?? "";
  const ticks = tickLayout(
    data.rows.map((record) => String(record[categoryKey] ?? "")),
  );
  const valueWidth = valueAxisWidth(
    seriesValues(
      data.rows,
      data.series.map((series) => series.key),
    ),
  );

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", WIDGET_HEIGHT[height])}
      config={toChartConfig(data.series)}
    >
      <LineChart accessibilityLayer data={data.rows}>
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
