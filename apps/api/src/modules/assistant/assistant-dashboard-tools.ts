import type {
  CreateWidgetInput,
  DashboardDetail,
  UpdateWidgetInput,
  WidgetInput,
} from "../dashboard/dashboard.schema";
import { dashboardService } from "../dashboard/dashboard.service";
import { dashboardWidgetsService } from "../dashboard/dashboard-widgets.service";
import { toWidgetFilter } from "./assistant-sheet";
import type { PreparedDelete } from "./assistant-sheet-tools";
import type { ToolContext, ToolResult } from "./assistant-tool-runtime";
import { ToolInputError } from "./assistant-tool-runtime";
import {
  defaultWidgetSpan,
  type ToolInput,
  type ToolWidgetQuery,
} from "./assistant-tools";

// The dashboard tools: thin calls into the dashboard services. The services
// validate every query against the sheet and name the path of the first
// problem, which is exactly what the model needs to correct itself, and place
// a card the model left unplaced (the engine's `placeWidget`: the first row
// with room, else a new one); this file only fills in a width for its type.

/** The dashboard as the model reads it back after a write: placement, no queries. */
function compact(detail: DashboardDetail) {
  return {
    title: detail.title,
    description: detail.description,
    widgets: detail.widgets.map((widget) => ({
      id: widget.id,
      name: widget.name,
      type: widget.type,
      variant: widget.variant,
      row: widget.row,
      column: widget.column,
      sort: widget.sort,
      height: widget.height,
    })),
  };
}

/** The flattened tool query as the schema's `WidgetQuery`. */
export function toWidgetQueryInput(
  query: ToolWidgetQuery,
): WidgetInput["query"] {
  return {
    filters: (query.filters ?? []).map(toWidgetFilter),
    groupBy: query.groupBy
      ? { column: query.groupBy.column, bucket: query.groupBy.bucket ?? "none" }
      : null,
    ...(query.splitBy && { splitBy: query.splitBy }),
    series: query.series,
    ...(query.sort && { sort: query.sort }),
    ...(query.limit !== undefined && { limit: query.limit }),
    ...(query.compare && { compare: query.compare }),
    ...(query.footer !== undefined && { footer: query.footer }),
  };
}

async function createWidget(
  ctx: ToolContext,
  input: ToolInput<"createWidget">,
): Promise<ToolResult> {
  const current = await dashboardService.byWorkspace(ctx.workspaceId);
  const known = new Set((current?.widgets ?? []).map((widget) => widget.id));
  const widget: CreateWidgetInput = {
    workspaceId: ctx.workspaceId,
    name: input.name,
    description: input.description ?? null,
    type: input.type,
    variant: input.variant ?? "default",
    height: input.height ?? "md",
    column: input.column ?? defaultWidgetSpan(input.type),
    ...(input.row !== undefined && { row: input.row }),
    ...(input.sort !== undefined && { sort: input.sort }),
    query: toWidgetQueryInput(input.query),
  };
  const detail = await dashboardWidgetsService.createWidget(widget);
  const created = detail.widgets.find((candidate) => !known.has(candidate.id));
  return {
    mutated: true,
    output: { created: created?.id ?? null, dashboard: compact(detail) },
    extra: { id: created?.id, name: input.name, type: input.type },
  };
}

async function updateWidget(
  ctx: ToolContext,
  input: ToolInput<"updateWidget">,
): Promise<ToolResult> {
  const stored = await findWidget(ctx, input.id);
  const patch: UpdateWidgetInput = {
    id: input.id,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.type !== undefined && { type: input.type }),
    ...(input.variant !== undefined && { variant: input.variant }),
    ...(input.height !== undefined && { height: input.height }),
    ...(input.column !== undefined && { column: input.column }),
    ...(input.row !== undefined && { row: input.row }),
    ...(input.sort !== undefined && { sort: input.sort }),
    ...(input.query !== undefined && {
      query: toWidgetQueryInput(input.query),
    }),
  };
  const detail = await dashboardWidgetsService.updateWidget(patch);
  return {
    mutated: true,
    output: { dashboard: compact(detail) },
    extra: { name: input.name ?? stored.name, type: input.type ?? stored.type },
  };
}

async function updateDashboard(
  ctx: ToolContext,
  input: ToolInput<"updateDashboard">,
): Promise<ToolResult> {
  const detail = await dashboardService.update({
    workspaceId: ctx.workspaceId,
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
  });
  return { mutated: true, output: { dashboard: compact(detail) } };
}

/** The card the model named, from the workspace's own dashboard only. */
async function findWidget(ctx: ToolContext, id: string) {
  const detail = await dashboardService.byWorkspace(ctx.workspaceId);
  const widget = detail?.widgets.find((candidate) => candidate.id === id);
  if (!widget) {
    const known = (detail?.widgets ?? [])
      .map((candidate) => `${candidate.id} ("${candidate.name}")`)
      .join(", ");
    throw new ToolInputError(
      `There is no card ${id} on this dashboard. The cards are: ${known || "(none)"}`,
      "UNKNOWN_WIDGET",
    );
  }
  return widget;
}

export async function prepareRemoveWidget(
  ctx: ToolContext,
  input: ToolInput<"removeWidget">,
): Promise<PreparedDelete> {
  const widget = await findWidget(ctx, input.id);
  return {
    extra: { name: widget.name, type: widget.type },
    execute: async () => {
      const detail = await dashboardWidgetsService.removeWidget(widget.id);
      return {
        mutated: true,
        output: { removed: widget.name, dashboard: compact(detail) },
      };
    },
  };
}

export function runDashboardTool(
  ctx: ToolContext,
  tool: "createWidget" | "updateWidget" | "updateDashboard",
  input: unknown,
): Promise<ToolResult> {
  switch (tool) {
    case "createWidget":
      return createWidget(ctx, input as ToolInput<"createWidget">);
    case "updateWidget":
      return updateWidget(ctx, input as ToolInput<"updateWidget">);
    case "updateDashboard":
      return updateDashboard(ctx, input as ToolInput<"updateDashboard">);
  }
}
