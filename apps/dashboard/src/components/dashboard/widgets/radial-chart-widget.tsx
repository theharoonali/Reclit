"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@reclit/ui/chart";
import { cn } from "@reclit/ui/cn";
import {
  Label,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
} from "recharts";
import type { DashboardWidget } from "@/dummy-data/dashboard.schema";
import { toChartConfig, WIDGET_HEIGHT } from "@/lib/dashboard/layout";

/**
 * A figure and caption centred in the chart, shadcn's radial "text" label. A
 * function returning the `<Label>` element, not a component: recharts finds
 * its `Label` children by element type, so a wrapper would be ignored.
 */
function centerLabel(value: string, caption: string) {
  return (
    <Label
      content={({ viewBox }) => {
        if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
        const { cx, cy } = viewBox;
        return (
          <text dominantBaseline="middle" textAnchor="middle" x={cx} y={cy}>
            <tspan className="fill-foreground text-title" x={cx} y={cy}>
              {value}
            </tspan>
            <tspan
              className="fill-muted-foreground text-caption"
              x={cx}
              y={(cy ?? 0) + 24}
            >
              {caption}
            </tspan>
          </text>
        );
      }}
      position="center"
    />
  );
}

/**
 * shadcn's radial chart.
 * - `default`: one ring per record (a slice: `categoryKey` + `valueKey`).
 * - `text`: the first record's 0–100 `valueKey` as one ring with the figure
 *   in the middle.
 * - `stacked`: the series of the first record stacked on a half ring, with
 *   their total in the middle.
 */
export function RadialChartWidget({ widget }: { widget: DashboardWidget }) {
  const { data, variant, height } = widget;
  const categoryKey = data.categoryKey ?? "";
  const valueKey = data.valueKey ?? "";
  const config = toChartConfig(data.series);
  const className = cn("aspect-auto w-full", WIDGET_HEIGHT[height]);
  const slices = data.rows.map((record) => ({
    ...record,
    fill: `var(--color-${record[categoryKey]})`,
  }));

  if (variant === "stacked") {
    const record = data.rows[0] ?? {};
    const total = data.series.reduce(
      (sum, series) => sum + Number(record[series.key] ?? 0),
      0,
    );
    return (
      <ChartContainer className={className} config={config}>
        <RadialBarChart
          data={[record]}
          endAngle={0}
          innerRadius="70%"
          outerRadius="110%"
          startAngle={180}
        >
          <ChartTooltip
            content={<ChartTooltipContent hideLabel />}
            cursor={false}
          />
          <PolarRadiusAxis axisLine={false} tick={false} tickLine={false}>
            {centerLabel(
              total.toLocaleString(),
              String(record[categoryKey] ?? ""),
            )}
          </PolarRadiusAxis>
          {data.series.map((series) => (
            <RadialBar
              className="stroke-transparent stroke-2"
              cornerRadius={5}
              dataKey={series.key}
              fill={`var(--color-${series.key})`}
              isAnimationActive={false}
              key={series.key}
              stackId="stack"
            />
          ))}
          <ChartLegend content={<ChartLegendContent />} />
        </RadialBarChart>
      </ChartContainer>
    );
  }

  if (variant === "text") {
    const first = slices.slice(0, 1);
    const value = Number(data.rows[0]?.[valueKey] ?? 0);
    const label = data.series[0]?.label ?? "";
    return (
      <ChartContainer className={className} config={config}>
        <RadialBarChart
          data={first}
          endAngle={-270}
          innerRadius="70%"
          outerRadius="95%"
          startAngle={90}
        >
          <PolarAngleAxis domain={[0, 100]} tick={false} type="number" />
          <RadialBar
            background
            cornerRadius={10}
            dataKey={valueKey}
            isAnimationActive={false}
          />
          <PolarRadiusAxis axisLine={false} tick={false} tickLine={false}>
            {centerLabel(`${value}%`, label)}
          </PolarRadiusAxis>
        </RadialBarChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer className={className} config={config}>
      <RadialBarChart data={slices} innerRadius="25%" outerRadius="100%">
        <ChartTooltip
          content={<ChartTooltipContent hideLabel nameKey={categoryKey} />}
          cursor={false}
        />
        <RadialBar background dataKey={valueKey} isAnimationActive={false} />
        <ChartLegend content={<ChartLegendContent nameKey={categoryKey} />} />
      </RadialBarChart>
    </ChartContainer>
  );
}
