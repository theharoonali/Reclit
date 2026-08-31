"use client";

import { HeaderTitle } from "@/components/layout/header-actions";
import { useWorkspace } from "./workspace-provider";

/**
 * Portals the active workspace's name — which is the spreadsheet's name — into
 * the header's title slot. Renders nothing while the list loads or when no
 * workspace exists. Mounted once from `app/(app)/layout.tsx`.
 */
export function WorkspaceHeaderTitle() {
  const { activeWorkspace } = useWorkspace();
  if (!activeWorkspace) return null;
  return (
    <HeaderTitle>
      <span className="block truncate">{activeWorkspace.name}</span>
    </HeaderTitle>
  );
}
