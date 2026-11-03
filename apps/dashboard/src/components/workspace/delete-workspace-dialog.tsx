"use client";

import { Button } from "@reclit/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@reclit/ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@/trpc/client";
import type { WorkspaceSummary } from "./workspace-provider";
import { useWorkspace } from "./workspace-provider";

/**
 * Confirms deleting one workspace. The cascade also deletes its spreadsheet
 * (workspace contract — workspace.api.test.ts), so the dialog names the
 * workspace and warns about its data. The API refuses the last workspace
 * (CONFLICT), surfaced with its own message; deleting the active workspace
 * switches to the first remaining one.
 */
export function DeleteWorkspaceDialog({
  workspace,
  onOpenChange,
}: {
  /** The workspace to delete; null keeps the dialog closed. */
  workspace: WorkspaceSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("workspace.remove");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();

  const remove = useMutation(
    trpc.workspace.remove.mutationOptions({
      onSuccess: async ({ id }) => {
        if (activeWorkspace?.id === id) {
          const next = workspaces.find((candidate) => candidate.id !== id);
          if (next) setActiveWorkspaceId(next.id);
        }
        await queryClient.invalidateQueries({
          queryKey: trpc.workspace.list.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.spreadsheet.list.queryKey(),
        });
        onOpenChange(false);
      },
    }),
  );

  const close = (open: boolean) => {
    if (!open) remove.reset();
    onOpenChange(open);
  };

  const lastWorkspace = remove.error?.data?.code === "CONFLICT";

  return (
    <Dialog onOpenChange={close} open={workspace !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", { name: workspace?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        {remove.isError && (
          <p className="text-caption text-destructive" role="alert">
            {lastWorkspace ? t("lastWorkspace") : t("error")}
          </p>
        )}

        <DialogFooter>
          <Button onClick={() => close(false)} type="button" variant="ghost">
            {t("cancel")}
          </Button>
          <Button
            disabled={remove.isPending || workspace === null}
            onClick={() => workspace && remove.mutate({ id: workspace.id })}
            type="button"
            variant="destructive"
          >
            {remove.isPending ? t("deleting") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
