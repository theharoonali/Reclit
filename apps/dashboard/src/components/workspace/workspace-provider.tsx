"use client";

import type { RouterOutputs } from "@reclit/api/trpc/routers/_app";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTRPC } from "@/trpc/client";

export type WorkspaceSummary = RouterOutputs["workspace"]["list"][number];

/** Survives reloads; self-heals when the stored workspace no longer exists. */
const STORAGE_KEY = "reclit.activeWorkspaceId";

type WorkspaceContextValue = {
  workspaces: WorkspaceSummary[];
  /** null while loading, on error, or when no workspace exists. */
  activeWorkspace: WorkspaceSummary | null;
  setActiveWorkspaceId: (id: string) => void;
  isPending: boolean;
  isError: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Owns which workspace is active. The choice is client state (the URL does not
 * carry it — docs/plans/013-workspaces.md), persisted in localStorage and read
 * post-mount so the server and first client render agree. A stored id that no
 * longer exists falls back to the first workspace.
 *
 * Mounted once from `app/(app)/layout.tsx`, above the shell, so the sidebar
 * menu, the header title and every page share one resolution.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.workspace.list.queryOptions());
  const [storedId, setStoredId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setStoredId(localStorage.getItem(STORAGE_KEY));
    } catch {
      // Storage can be unavailable (private mode); the first workspace wins.
    }
  }, []);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setStoredId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Not persisted; the choice still holds for this tab.
    }
  }, []);

  const value = useMemo<WorkspaceContextValue>(() => {
    const workspaces = query.data ?? [];
    const activeWorkspace =
      workspaces.find((workspace) => workspace.id === storedId) ??
      workspaces[0] ??
      null;
    return {
      workspaces,
      activeWorkspace,
      setActiveWorkspaceId,
      isPending: query.isPending,
      isError: query.isError,
    };
  }, [
    query.data,
    query.isPending,
    query.isError,
    storedId,
    setActiveWorkspaceId,
  ]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return value;
}
