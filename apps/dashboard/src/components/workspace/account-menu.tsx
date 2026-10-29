"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@reclit/ui/avatar";
import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@reclit/ui/dropdown-menu";
import { focusOutline } from "@reclit/ui/focus-ring";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { DeleteWorkspaceDialog } from "./delete-workspace-dialog";
import { useWorkspace, type WorkspaceSummary } from "./workspace-provider";

/**
 * The account block at the bottom of the sidebar: the user's avatar with the
 * active workspace's name and the user's email as the trigger, with a menu
 * (opening above it, sized to the trigger) that lists every
 * workspace (picking one makes it active, its trash icon asks to delete it —
 * hidden on the last workspace, which the API refuses to delete), a "new
 * workspace" entry, a link to /settings and a log-out item that clears the
 * session cookie and returns to /login (docs/features/auth.md).
 */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("account");
  const tw = useTranslations("workspace");
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useQuery(trpc.user.me.queryOptions());
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceSummary | null>(
    null,
  );

  const logout = useMutation(
    trpc.auth.logout.mutationOptions({
      onSuccess: () => {
        // Evict only the session entry, so /login does not read a stale
        // "authenticated" and bounce back. Clearing the whole cache here
        // would make the still-mounted user.me refetch without a session
        // and log an UNAUTHORIZED; the login screen invalidates everything
        // on the next sign-in instead.
        queryClient.removeQueries({
          queryKey: trpc.auth.session.queryKey(),
        });
        router.replace("/login");
      },
    }),
  );

  const workspaceName = activeWorkspace?.name ?? "";
  const email = me.data?.email ?? "";
  const initial = (workspaceName || me.data?.name || "").charAt(0);

  return (
    <>
      <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("menuLabel")}
            className={cn(
              "h-auto w-full justify-start gap-3 px-2 py-2",
              // An outline, not the halo — the halo reads as a floating card
              // against the sidebar border.
              focusOutline,
              collapsed && "justify-center px-0",
            )}
            type="button"
            variant="ghost"
          >
            <Avatar className="h-8 w-8 rounded-sm">
              <AvatarImage alt="" src={me.data?.imageUrl ?? undefined} />
              <AvatarFallback className="rounded-sm">
                {initial.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-label">
                    {workspaceName}
                  </span>
                  {email && (
                    <span className="block truncate text-caption font-normal text-muted-foreground">
                      {email}
                    </span>
                  )}
                </span>
                <ChevronsUpDown className="text-muted-foreground" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        {/* Sized to the trigger so the menu stays inside the sidebar column
            and never crosses its border into the page. */}
        <DropdownMenuContent
          align="start"
          side="top"
          style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
        >
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              className="group"
              key={workspace.id}
              onSelect={() => setActiveWorkspaceId(workspace.id)}
            >
              <WorkspaceTile name={workspace.name} />
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              {workspace.id === activeWorkspace?.id && (
                <Check className="text-primary" />
              )}
              {/* The API refuses deleting the last workspace, so the icon
                  only shows when there is another one to fall back to —
                  and only while its row is highlighted, like a row action,
                  not a permanent control. */}
              {workspaces.length > 1 && (
                <button
                  aria-label={tw("remove.iconLabel", { name: workspace.name })}
                  className="shrink-0 rounded-sm text-muted-foreground/70 opacity-0 hover:text-destructive focus-visible:opacity-100 group-data-[highlighted]:opacity-100"
                  onClick={(event) => {
                    // A click inside the item must not also select the
                    // workspace or keep the menu under the dialog.
                    event.stopPropagation();
                    setMenuOpen(false);
                    setDeleteTarget(workspace);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  type="button"
                >
                  <Trash2 className="size-icon" strokeWidth={1.5} />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus />
            {tw("newWorkspace")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings />
              {t("settings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => logout.mutate()}>
            <LogOut />
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog onOpenChange={setCreateOpen} open={createOpen} />
      <DeleteWorkspaceDialog
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        workspace={deleteTarget}
      />
    </>
  );
}

/** The initial-letter tile — the sidebar's de-facto workspace mark. */
function WorkspaceTile({ name }: { name: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-caption font-semibold text-primary">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
