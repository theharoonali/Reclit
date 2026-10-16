"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@reclit/ui/chart";
import { cn } from "@reclit/ui/cn";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts";
import { toChartConfig, WIDGET_HEIGHT } from "@/lib/dashboard/layout";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";

/**
 * shadcn's radar chart: `categoryKey` is each spoke, every series a filled
 * shape. `dots` marks each point.
 */
export function RadarChartWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, height } = widget;
  const overlapping = data.series.length > 1;

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", WIDGET_HEIGHT[height])}
      config={toChartConfig(data.series)}
    >
      <RadarChart data={data.rows}>
        <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
        <PolarAngleAxis dataKey={data.categoryKey} />
        <PolarGrid />
        {overlapping && <ChartLegend content={<ChartLegendContent />} />}
        {data.series.map((series) => (
          <Radar
            dataKey={series.key}
            dot={variant === "dots" ? { r: 4, fillOpacity: 1 } : false}
            fill={`var(--color-${series.key})`}
            fillOpacity={overlapping ? 0.3 : 0.6}
            isAnimationActive={false}
            key={series.key}
            stroke={`var(--color-${series.key})`}
          />
        ))}
      </RadarChart>
    </ChartContainer>
  );
}
