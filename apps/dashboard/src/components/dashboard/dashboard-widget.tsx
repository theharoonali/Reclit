"use client";

import type { DashboardWidget } from "@/lib/dashboard/widget-state";
import { useWidgetData } from "./use-widget-data";
import { WidgetCard } from "./widget-card";

/**
 * One stored dashboard cell: the card's config from the dashboard, its data
 * computed from the sheet by `useWidgetData`, drawn by `WidgetCard`. Named
 * `…Card` because `DashboardWidget` is the config type.
 */
export function DashboardWidgetCard({ widget }: { widget: DashboardWidget }) {
  const state = useWidgetData(widget);
  return <WidgetCard state={state} widget={widget} />;
}
