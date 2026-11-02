"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type ReactNode, useCallback, useState } from "react";
import { useAssistantPageAction } from "@/components/assistant/use-page-action";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageShell } from "@/components/common/page-shell";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useTRPC } from "@/trpc/client";
import { DashboardEmpty } from "./dashboard-empty";
import { DashboardGenerationProgress } from "./dashboard-generation-progress";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardHeaderActions } from "./dashboard-header-actions";
import { DashboardWidgetCard } from "./dashboard-widget";
import { useDashboardGeneration } from "./use-dashboard-generation";
import { useDashboardLiveRows } from "./use-dashboard-live-rows";

/**
 * The page body: the active workspace's dashboard config
 * (`dashboard.byWorkspace`) → the grid, or the empty state. The page has
 * no heading of its own; a title and subtitle show only when the config
 * sets them. Switching workspaces swaps the query —
 * the URL never carries the workspace (docs/plans/013-workspaces.md).
 *
 * While the dashboard is empty the assistant island offers "AI
 * Recommendations" (the page's action pill), which starts a dashboard
 * generation; its progress renders here in place of the empty state, and a
 * generation that found nothing worth charting leaves the "no value" copy.
 * A failed or cancelled generation can be dismissed — the card gives way to
 * the empty state until another generation starts.
 */
export function DashboardPanel() {
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
  const live = useDashboardLiveRows(
    workspace.activeWorkspace?.spreadsheetId ?? "",
  );
  const isLoaded =
    workspaceId !== "" && !dashboard.isPending && !dashboard.isError;

  const generation = useDashboardGeneration(workspaceId);
  const { start } = generation;
  const startFromDashboard = useCallback(() => {
    void start("dashboard");
  }, [start]);
  const isBusy = generation.isStarting || generation.isActive;
  useAssistantPageAction(
    isLoaded && widgets.length === 0 && !generation.isActive
      ? {
          label: t("generation.action"),
          description: isBusy
            ? t("generation.busy")
            : t("generation.description"),
          busy: isBusy,
          errorMessage: generation.errorKey
            ? t(`generation.errors.${generation.errorKey}`)
            : null,
          onRun: startFromDashboard,
          onDismissError: generation.dismissError,
        }
      : null,
  );

  const [dismissed, setDismissed] = useState<string | null>(null);
  const row = generation.generation;
  const stopped =
    row !== null && (row.status === "failed" || row.status === "cancelled");
  const isEmpty = widgets.length === 0;
  const showProgress =
    row !== null &&
    row.id !== dismissed &&
    (generation.isActive || (stopped && isEmpty));

  let body: ReactNode;
  if (workspace.isError || dashboard.isError) {
    body = <ErrorState className="h-chart-lg" message={t("loadError")} />;
  } else if (
    workspace.isPending ||
    (workspaceId !== "" && dashboard.isPending)
  ) {
    body = <LoadingState className="h-chart-lg" label={t("loading")} />;
  } else if (showProgress) {
    body = (
      <DashboardGenerationProgress
        generation={row}
        isStarting={generation.isStarting}
        onCancel={generation.cancel}
        onDismiss={() => setDismissed(row.id)}
        onRetry={startFromDashboard}
      />
    );
  } else if (isEmpty) {
    body = (
      <DashboardEmpty
        reason={
          row?.status === "completed" && row.result?.reason === "no_value"
            ? "noValue"
            : undefined
        }
        workspaceId={workspaceId || null}
      />
    );
  } else {
    body = (
      <DashboardGrid
        renderCard={(widget) => (
          <DashboardWidgetCard key={widget.id} widget={widget} />
        )}
        widgets={widgets}
      />
    );
  }

  return (
    <PageShell
      description={config?.description ?? undefined}
      title={config?.title ?? undefined}
      wide
    >
      <DashboardHeaderActions fillingCount={live.pendingCount} />
      {body}
    </PageShell>
  );
}
