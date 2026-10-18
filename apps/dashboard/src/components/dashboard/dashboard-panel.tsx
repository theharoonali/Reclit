"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useAssistantPageAction } from "@/components/assistant/use-page-action";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageShell } from "@/components/common/page-shell";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useTRPC } from "@/trpc/client";
import { DashboardEmpty } from "./dashboard-empty";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardHeaderActions } from "./dashboard-header-actions";
import { DashboardRecommendations } from "./dashboard-recommendations";
import { DashboardWidgetCard } from "./dashboard-widget";
import { useDashboardRecommendations } from "./use-dashboard-recommendations";

/**
 * The page body: the active workspace's dashboard config
 * (`dashboard.byWorkspace`) → the grid, or the empty state. The config
 * decides the page's own title and subtitle too, falling back to the
 * message keys the page passes in. Switching workspaces swaps the query —
 * the URL never carries the workspace (docs/plans/013-workspaces.md).
 *
 * While the dashboard is empty the assistant island offers "AI
 * Recommendations" (the page's action pill); the proposed cards render here,
 * in place of the empty state, or under the grid once the first was added.
 */
export function DashboardPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const t = useTranslations("dashboard");
  const trpc = useTRPC();
  const workspace = useWorkspace();
  const workspaceId = workspace.activeWorkspace?.id ?? "";

  const dashboard = useQuery(
    trpc.dashboard.byWorkspace.queryOptions(
      { workspaceId },
      { enabled: workspaceId !== "" },
    ),
  );
  const config = dashboard.data ?? null;
  const widgets = config?.widgets ?? [];
  const isLoaded =
    workspaceId !== "" && !dashboard.isPending && !dashboard.isError;

  const recommendations = useDashboardRecommendations(workspaceId);
  const hasSet = recommendations.set !== null;
  useAssistantPageAction(
    isLoaded && widgets.length === 0 && !hasSet
      ? {
          label: t("recommendations.action"),
          description: recommendations.isRecommending
            ? t("recommendations.busy")
            : t("recommendations.description"),
          busy: recommendations.isRecommending,
          errorMessage: recommendations.errorMessage,
          onRun: recommendations.run,
          onDismissError: recommendations.dismissError,
        }
      : null,
  );

  let body: ReactNode;
  if (workspace.isError || dashboard.isError) {
    body = <ErrorState className="h-chart-lg" message={t("loadError")} />;
  } else if (
    workspace.isPending ||
    (workspaceId !== "" && dashboard.isPending)
  ) {
    body = <LoadingState className="h-chart-lg" label={t("loading")} />;
  } else if (widgets.length === 0) {
    body = hasSet ? (
      <DashboardRecommendations recommendations={recommendations} />
    ) : (
      <DashboardEmpty workspaceId={workspaceId || null} />
    );
  } else {
    body = (
      <div className="space-y-8">
        <DashboardGrid
          renderCard={(widget) => (
            <DashboardWidgetCard key={widget.id} widget={widget} />
          )}
          widgets={widgets}
        />
        {hasSet && (
          <DashboardRecommendations recommendations={recommendations} />
        )}
      </div>
    );
  }

  return (
    <PageShell
      description={config?.description ?? description}
      title={config?.title ?? title}
      wide
    >
      {workspaceId !== "" && (
        <DashboardHeaderActions workspaceId={workspaceId} />
      )}
      {body}
    </PageShell>
  );
}
