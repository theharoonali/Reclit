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
import { toChartConfig, WIDGET_HEIGHT } from "@/lib/dashboard/layout";
import type { ResolvedWidget } from "@/lib/dashboard/widget-state";

/**
 * shadcn's pie chart. Each record is a slice: `categoryKey` names it (and
 * picks its series colour), `valueKey` sizes it. `donut` hollows the centre;
 * `label` prints each slice's value on it.
 */
export function PieChartWidget({ widget }: { widget: ResolvedWidget }) {
  const { data, variant, height } = widget;
  const categoryKey = data.categoryKey ?? "";
  const slices = data.rows.map((record) => ({
    ...record,
    fill: `var(--color-${record[categoryKey]})`,
  }));

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", WIDGET_HEIGHT[height])}
      config={toChartConfig(data.series)}
    >
      <PieChart>
        <ChartTooltip
          content={<ChartTooltipContent hideLabel nameKey={categoryKey} />}
          cursor={false}
        />
        <Pie
          data={slices}
          dataKey={data.valueKey ?? ""}
          innerRadius={variant === "donut" ? "55%" : 0}
          isAnimationActive={false}
          label={variant === "label"}
          nameKey={categoryKey}
          strokeWidth={2}
        />
        <ChartLegend content={<ChartLegendContent nameKey={categoryKey} />} />
      </PieChart>
    </ChartContainer>
  );
}
