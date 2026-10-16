"use client";

import { Button } from "@reclit/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/trpc/client";

/**
 * The page before any dashboard exists for the workspace. One action: let the
 * API build a starter from the sheet's columns (`dashboard.createStarter`),
 * then reload the dashboard query. Without a workspace there is nothing to
 * build from, so the copy stands alone.
 */
export function DashboardEmpty({
  workspaceId,
}: {
  workspaceId: string | null;
}) {
  const t = useTranslations("dashboard.empty");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const create = useMutation(
    trpc.dashboard.createStarter.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.byWorkspace.queryKey(),
        }),
    }),
  );

  return (
    <div className="flex flex-col items-center justify-center rounded-sm border border-border border-dashed bg-card px-6 py-20 text-center">
      <span className="flex size-avatar items-center justify-center rounded-sm bg-primary/10 text-primary">
        <LayoutGrid aria-hidden="true" className="size-icon" />
      </span>
      <h2 className="mt-5 text-subheading">{t("title")}</h2>
      <p className="mt-2 max-w-sm text-muted-foreground text-subtitle">
        {t("description")}
      </p>
      {workspaceId !== null && (
        <Button
          className="mt-6"
          disabled={create.isPending}
          onClick={() => create.mutate({ workspaceId })}
          size="sm"
          type="button"
          variant="default"
        >
          {create.isPending ? t("creating") : t("create")}
        </Button>
      )}
      {create.isError && (
        <p className="mt-3 text-caption text-destructive" role="alert">
          {t("error")}
        </p>
      )}
    </div>
  );
}
