import type { RouterOutputs } from "@reclit/api/trpc/routers/_app";
import type {
  QueryIssue,
  WidgetData,
  WidgetResult,
} from "@reclit/dashboard-engine";

/**
 * The dashboard's types, derived from the router so they cannot drift, and
 * the pure reduction of "sheet query + engine verdict" into the one state a
 * card renders.
 */

export type Dashboard = NonNullable<RouterOutputs["dashboard"]["byWorkspace"]>;
export type DashboardWidget = Dashboard["widgets"][number];

/** What a card is drawn from — a stored widget, or a proposed one with no id and no slot. */
export type WidgetView = Pick<
  DashboardWidget,
  "name" | "description" | "type" | "variant" | "height" | "column" | "query"
>;

/** What a card computes from: the sheet it reads and the engine's `WidgetSpec`. */
export type WidgetSource = Pick<
  DashboardWidget,
  "spreadsheetId" | "type" | "variant" | "query"
>;

/** A widget config with its computed data — what the renderers take. */
export type ResolvedWidget = WidgetView & { data: WidgetData };

/** The assistant's proposed cards (`assistant.recommendWidgets`). */
export type AssistantRecommendations =
  RouterOutputs["assistant"]["recommendWidgets"];
export type AssistantRecommendation =
  AssistantRecommendations["recommendations"][number];

/** The `dashboard.widget.errors.*` message for an engine issue. */
export type WidgetIssueKey = "unknownColumn" | "formula" | "query";

export function widgetIssueMessageKey(issue: QueryIssue): WidgetIssueKey {
  switch (issue.code) {
    case "UNKNOWN_COLUMN":
      return "unknownColumn";
    case "FORMULA_INVALID":
      return "formula";
    default:
      return "query";
  }
}

export type WidgetState =
  | { status: "pending" }
  /** The sheet could not be fetched. */
  | { status: "error" }
  /** The sheet loaded but the widget's query does not fit it any more. */
  | { status: "invalid"; issue: QueryIssue }
  | { status: "ready"; data: WidgetData };

export function toWidgetState(query: {
  status: "pending" | "error" | "success";
  data: WidgetResult | undefined;
}): WidgetState {
  if (query.status === "error") return { status: "error" };
  if (query.status === "pending" || query.data === undefined) {
    return { status: "pending" };
  }
  if (query.data.ok) return { status: "ready", data: query.data.data };
  const issue = query.data.issues[0];
  return issue ? { status: "invalid", issue } : { status: "error" };
}
