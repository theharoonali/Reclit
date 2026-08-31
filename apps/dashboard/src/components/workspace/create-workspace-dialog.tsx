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
import { Input } from "@reclit/ui/input";
import { Label } from "@reclit/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { useTRPC } from "@/trpc/client";
import { useWorkspace } from "./workspace-provider";

/**
 * Creates a workspace — which allots it a same-named spreadsheet — and makes
 * it the active one.
 */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("workspace.create");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { setActiveWorkspaceId } = useWorkspace();
  const [name, setName] = useState("");

  const create = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: async (workspace) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.workspace.list.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.spreadsheet.list.queryKey(),
        });
        setActiveWorkspaceId(workspace.id);
        setName("");
        onOpenChange(false);
      },
    }),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || create.isPending) return;
    create.mutate({ name: trimmed });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="workspace-name">{t("nameLabel")}</Label>
            <Input
              autoFocus
              id="workspace-name"
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
              value={name}
            />
          </div>

          {create.isError && (
            <p role="alert" className="text-caption text-destructive">
              {t("error")}
            </p>
          )}

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              {t("cancel")}
            </Button>
            <Button
              disabled={name.trim().length === 0}
              type="submit"
              variant="default"
            >
              {create.isPending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
