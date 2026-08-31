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
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, LogOut, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { useWorkspace } from "./workspace-provider";

/**
 * The account block at the bottom of the sidebar: the user's avatar with the
 * active workspace's name and the user's email as the trigger, with a menu
 * (opening above it, sized to the trigger) that lists every
 * workspace (picking one makes it active), a "new workspace" entry, a link to
 * /settings and a log-out item. There is no auth yet — log out is UI only.
 */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("account");
  const tw = useTranslations("workspace");
  const trpc = useTRPC();
  const me = useQuery(trpc.user.me.queryOptions());
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);

  const workspaceName = activeWorkspace?.name ?? "";
  const email = me.data?.email ?? "";
  const initial = (workspaceName || me.data?.name || "").charAt(0);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("menuLabel")}
            className={cn(
              "h-auto w-full justify-start gap-3 px-2 py-2",
              // Focus shows as an outline here, not the shared shadow ring —
              // the halo reads as a floating card against the sidebar border.
              "focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-0",
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
              key={workspace.id}
              onSelect={() => setActiveWorkspaceId(workspace.id)}
            >
              <WorkspaceTile name={workspace.name} />
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              {workspace.id === activeWorkspace?.id && (
                <Check className="text-primary" />
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
          <DropdownMenuItem>
            <LogOut />
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog onOpenChange={setCreateOpen} open={createOpen} />
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
