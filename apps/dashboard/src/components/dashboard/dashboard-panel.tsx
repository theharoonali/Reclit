"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { PageShell } from "@/components/common/page-shell";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useTRPC } from "@/trpc/client";
import { DashboardEmpty } from "./dashboard-empty";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardHeaderActions } from "./dashboard-header-actions";

/**
 * The page body: the active workspace's dashboard config
 * (`dashboard.byWorkspace`) → the grid, or the empty state. The config
 * decides the page's own title and subtitle too, falling back to the
 * message keys the page passes in. Switching workspaces swaps the query —
 * the URL never carries the workspace (docs/plans/013-workspaces.md).
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

  let body: ReactNode;
  if (workspace.isError || dashboard.isError) {
    body = <ErrorState className="h-chart-lg" message={t("loadError")} />;
  } else if (
    workspace.isPending ||
    (workspaceId !== "" && dashboard.isPending)
  ) {
    body = <LoadingState className="h-chart-lg" label={t("loading")} />;
  } else if (!config || config.widgets.length === 0) {
    body = <DashboardEmpty workspaceId={workspaceId || null} />;
  } else {
    body = <DashboardGrid widgets={config.widgets} />;
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
