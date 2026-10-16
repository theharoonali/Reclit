"use client";

import { Button } from "@reclit/ui/button";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { HeaderActions } from "@/components/layout/header-actions";
import { SHEET_ROWS_QUERY_PREFIX } from "@/lib/dashboard/sheet-rows-query";
import { useTRPC } from "@/trpc/client";

/**
 * The dashboard's one header control, portalled into the app header
 * (`docs/rules/FRONTEND.md`: page controls live there). Refresh re-reads the
 * sheet rows every widget computes from and the dashboard config itself.
 */
export function DashboardHeaderActions({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const t = useTranslations("dashboard");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching({ queryKey: SHEET_ROWS_QUERY_PREFIX }) > 0;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: SHEET_ROWS_QUERY_PREFIX });
    queryClient.invalidateQueries({
      queryKey: trpc.dashboard.byWorkspace.queryKey({ workspaceId }),
    });
  };

  return (
    <HeaderActions>
      <Button
        disabled={isFetching}
        onClick={handleRefresh}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCw
          aria-hidden="true"
          className={
            isFetching ? "animate-spin motion-reduce:animate-none" : undefined
          }
        />
        {t("refresh")}
      </Button>
    </HeaderActions>
  );
}
