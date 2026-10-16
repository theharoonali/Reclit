"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@reclit/ui/card";
import { cn } from "@reclit/ui/cn";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { COLUMN_SPAN, WIDGET_HEIGHT } from "@/lib/dashboard/layout";
import {
  type DashboardWidget,
  type ResolvedWidget,
  type WidgetState,
  widgetIssueMessageKey,
} from "@/lib/dashboard/widget-state";
import { useWidgetData } from "./use-widget-data";
import { AreaChartWidget } from "./widgets/area-chart-widget";
import { BarChartWidget } from "./widgets/bar-chart-widget";
import { HeatmapWidget } from "./widgets/heatmap-widget";
import { LineChartWidget } from "./widgets/line-chart-widget";
import { PieChartWidget } from "./widgets/pie-chart-widget";
import { RadarChartWidget } from "./widgets/radar-chart-widget";
import { RadialChartWidget } from "./widgets/radial-chart-widget";
import { StatWidget } from "./widgets/stat-widget";
import { TableWidget } from "./widgets/table-widget";
import { WidgetFooter } from "./widgets/widget-footer";

/** The body for a widget's `type`. Exhaustive: a new type fails to compile here. */
function WidgetBody({ widget }: { widget: ResolvedWidget }) {
  switch (widget.type) {
    case "stat":
      return <StatWidget widget={widget} />;
    case "area":
      return <AreaChartWidget widget={widget} />;
    case "bar":
      return <BarChartWidget widget={widget} />;
    case "line":
      return <LineChartWidget widget={widget} />;
    case "pie":
      return <PieChartWidget widget={widget} />;
    case "radar":
      return <RadarChartWidget widget={widget} />;
    case "radial":
      return <RadialChartWidget widget={widget} />;
    case "heatmap":
      return <HeatmapWidget widget={widget} />;
    case "table":
      return <TableWidget widget={widget} />;
    default: {
      const unhandled: never = widget.type;
      throw new Error(`No renderer for widget type "${unhandled}"`);
    }
  }
}

/**
 * What a card shows before its data is ready: a spinner while the sheet
 * loads, or why it cannot be computed. `compact` is the stat's one-line
 * version; otherwise the box is the chart body's height so the grid does not
 * jump when the data lands.
 */
function WidgetStatus({
  state,
  className,
}: {
  state: Exclude<WidgetState, { status: "ready" }>;
  className: string;
}) {
  const t = useTranslations("dashboard.widget");
  switch (state.status) {
    case "pending":
      return <LoadingState className={className} label={t("loading")} />;
    case "error":
      return <ErrorState className={className} message={t("loadError")} />;
    case "invalid":
      return (
        <ErrorState
          className={className}
          message={t(`errors.${widgetIssueMessageKey(state.issue)}`, {
            column: state.issue.detail ?? "",
          })}
        />
      );
  }
}

/**
 * One dashboard cell: a card spanning `column` of the row's 12 columns, its
 * data computed from the sheet by `useWidgetData`. A stat draws its whole
 * card; every other type gets the title, description, body and footer
 * frame. Named `…Card` because `DashboardWidget` is the config type.
 */
export function DashboardWidgetCard({ widget }: { widget: DashboardWidget }) {
  const state = useWidgetData(widget);
  const span = COLUMN_SPAN[widget.column];

  if (widget.type === "stat") {
    return (
      <Card className={cn("min-w-0", span)}>
        {state.status === "ready" ? (
          <StatWidget widget={{ ...widget, data: state.data }} />
        ) : (
          <div className="flex h-full flex-col gap-4 p-6">
            <p className="text-label">{widget.name}</p>
            <WidgetStatus
              className="h-spinner-lg justify-start p-0 text-left"
              state={state}
            />
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card className={cn("flex min-w-0 flex-col", span)}>
      <CardHeader>
        <CardTitle>{widget.name}</CardTitle>
        {widget.description && (
          <CardDescription>{widget.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {state.status === "ready" ? (
          <WidgetBody widget={{ ...widget, data: state.data }} />
        ) : (
          <WidgetStatus
            className={WIDGET_HEIGHT[widget.height]}
            state={state}
          />
        )}
      </CardContent>
      {state.status === "ready" && state.data.footer && (
        <CardFooter>
          <WidgetFooter footer={state.data.footer} trend={state.data.trend} />
        </CardFooter>
      )}
    </Card>
  );
}
