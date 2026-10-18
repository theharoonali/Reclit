"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { type AssistantScope, scopeForPath } from "@/config/assistant";
import { useLatestRef } from "@/hooks/use-latest-ref";
import type {
  AssistantErrorKey,
  AssistantRun,
  TerminalStatus,
} from "@/lib/assistant/types";
import { SHEET_ROWS_QUERY_PREFIX } from "@/lib/dashboard/sheet-rows-query";
import { useTRPC } from "@/trpc/client";
import { useAssistantRun } from "./use-assistant-run";
import { useRunLifecycle } from "./use-run-lifecycle";

/**
 * What a page registers so the assistant can work with it: something to do
 * before a run starts (the sheet flushes its pending edits — the run reads
 * the database, not the grid) and how to show the run's changes.
 */
export type PageHandlers = {
  beforeStart?: () => Promise<void> | void;
  refresh: () => Promise<void> | void;
};

/**
 * The one action a page may put in the capsule's right-hand pill — the
 * sheet's Run while its selection holds AI cells, the dashboard's AI
 * Recommendations while it is empty (`useAssistantPageAction`). The page
 * owns the words: `label`, `description` and `errorMessage` arrive
 * translated.
 */
export type PageAction = {
  /** The pill's text: short ("Run AI"). */
  label: string;
  /** The accessible name and tooltip: with the count ("Run 3 cells"), or the busy state. */
  description: string;
  /** The request is on its way, or the cells are already working: the pill shows `description` and refuses clicks. */
  busy: boolean;
  /** Why the last attempt was refused; shown in the capsule until dismissed. */
  errorMessage: string | null;
  onRun: () => void;
  onDismissError: () => void;
};

export type AssistantContextValue = {
  /** The island's scope on this route, or `null` where it is hidden. */
  scope: AssistantScope | null;
  run: AssistantRun | null;
  lastTerminal: TerminalStatus | null;
  isSubmitting: boolean;
  errorKey: AssistantErrorKey | null;
  /** Resolves `true` once the run was accepted; `false` sets `errorKey`. */
  start: (prompt: string) => Promise<boolean>;
  cancel: () => void;
  respond: (approved: boolean) => void;
  dismiss: () => void;
  /** Returns the unregister function. One page per scope. */
  registerPage: (scope: AssistantScope, handlers: PageHandlers) => () => void;
  /** The current page's action pill, or null when it offers none. */
  pageAction: PageAction | null;
  setPageAction: (action: PageAction | null) => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

/**
 * Owns the assistant run for the active workspace and the registry of page
 * handlers. Mounted once from `app/(app)/layout.tsx`, above the shell, with
 * `<AssistantIsland />` as its only consumer today.
 *
 * After a mutating step and when a run ends, the page of the run's scope is
 * refreshed through its handler, and the dashboard's caches are invalidated
 * regardless: every dashboard card computes from the sheet, so a sheet run
 * changes the dashboard too, and the `/` page needs no handler of its own.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const scope = scopeForPath(pathname);
  const scopeRef = useLatestRef(scope);
  const { activeWorkspace } = useWorkspace();
  const workspaceId = activeWorkspace?.id ?? "";
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const api = useAssistantRun(workspaceId);
  const pages = useRef(new Map<AssistantScope, PageHandlers>());
  const [pageAction, setPageAction] = useState<PageAction | null>(null);

  const registerPage = useCallback(
    (pageScope: AssistantScope, handlers: PageHandlers) => {
      pages.current.set(pageScope, handlers);
      return () => {
        if (pages.current.get(pageScope) === handlers) {
          pages.current.delete(pageScope);
        }
      };
    },
    [],
  );

  const start = useCallback(
    async (prompt: string) => {
      const current = scopeRef.current;
      if (!current) return false;
      await pages.current.get(current)?.beforeStart?.();
      return api.start(prompt, current);
    },
    [api.start, scopeRef],
  );

  const refreshDashboard = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: SHEET_ROWS_QUERY_PREFIX });
    if (workspaceId !== "") {
      void queryClient.invalidateQueries({
        queryKey: trpc.dashboard.byWorkspace.queryKey({ workspaceId }),
      });
    }
  }, [queryClient, trpc, workspaceId]);

  useRunLifecycle(api.run, {
    onRefresh: () => {
      const runScope = api.run?.scope;
      if (runScope) void pages.current.get(runScope)?.refresh();
      refreshDashboard();
    },
    onDismiss: api.dismiss,
  });

  const value = useMemo<AssistantContextValue>(
    () => ({
      scope,
      run: api.run,
      lastTerminal: api.lastTerminal,
      isSubmitting: api.isSubmitting,
      errorKey: api.errorKey,
      start,
      cancel: api.cancel,
      respond: api.respond,
      dismiss: api.dismiss,
      registerPage,
      pageAction,
      setPageAction,
    }),
    [
      scope,
      api.run,
      api.lastTerminal,
      api.isSubmitting,
      api.errorKey,
      api.cancel,
      api.respond,
      api.dismiss,
      start,
      registerPage,
      pageAction,
    ],
  );

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) {
    throw new Error("useAssistant must be used inside AssistantProvider");
  }
  return value;
}
