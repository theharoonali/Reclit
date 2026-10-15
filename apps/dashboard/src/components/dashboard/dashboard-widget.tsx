import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@reclit/ui/card";
import { cn } from "@reclit/ui/cn";
import type { DashboardWidget as Widget } from "@/dummy-data/dashboard.schema";
import { COLUMN_SPAN } from "@/lib/dashboard/layout";
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
function WidgetBody({ widget }: { widget: Widget }) {
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
 * One dashboard cell: a card spanning `column` of the row's 12 columns. A
 * stat draws its whole card; every other type gets the title, description,
 * body and footer frame.
 */
export function DashboardWidget({ widget }: { widget: Widget }) {
  const span = COLUMN_SPAN[widget.column];

  if (widget.type === "stat") {
    return (
      <Card className={cn("min-w-0", span)}>
        <WidgetBody widget={widget} />
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
        <WidgetBody widget={widget} />
      </CardContent>
      {widget.data.footer && (
        <CardFooter>
          <WidgetFooter footer={widget.data.footer} trend={widget.data.trend} />
        </CardFooter>
      )}
    </Card>
  );
}
