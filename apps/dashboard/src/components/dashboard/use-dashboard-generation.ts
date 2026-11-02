"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  type DashboardGeneration,
  generationErrorKey,
  isTerminalGeneration,
} from "@/lib/dashboard/generation";
import { sheetRowsQueryKey } from "@/lib/dashboard/sheet-rows-query";
import { useTRPC } from "@/trpc/client";

export type GenerationSource = DashboardGeneration["source"];

export type DashboardGenerationApi = {
  /** The live row: the latest query seeds it, stream updates win by newer `updatedAt`. */
  generation: DashboardGeneration | null;
  /** A generation exists and has not finished. */
  isActive: boolean;
  isStarting: boolean;
  start: (source: GenerationSource) => Promise<void>;
  cancel: () => Promise<void>;
  errorKey: ReturnType<typeof generationErrorKey> | null;
  dismissError: () => void;
};

/**
 * Events may repeat on reconnect and a mutation's answer may cross a stream
 * event: the newer row wins. A different generation is newer when it was
 * updated later — a generation started elsewhere replaces a finished one.
 */
const newer = (
  current: DashboardGeneration | null,
  next: DashboardGeneration,
): DashboardGeneration =>
  !current || next.updatedAt.getTime() >= current.updatedAt.getTime()
    ? next
    : current;

const isAlive = (candidate: DashboardGeneration | null | undefined) =>
  candidate != null && !isTerminalGeneration(candidate);

/**
 * The workspace's dashboard generation, live. On load
 * `dashboardGeneration.latest` says what a reload should show (a finished
 * one included — the no-value empty state reads its result); while one is
 * active the `dashboardGeneration.onChange` stream carries every phase, and
 * `start` opens the stream ahead of the row so the first event is the
 * insert. When a generation completes, the dashboard config and the sheet
 * rows are refetched once — the worker wrote the widgets — and
 * `onCompleted` fires. A workspace switch drops the other workspace's row.
 */
export function useDashboardGeneration(
  workspaceId: string,
  options?: { onCompleted?: (generation: DashboardGeneration) => void },
): DashboardGenerationApi {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const input = { workspaceId };

  const latest = useQuery(
    trpc.dashboardGeneration.latest.queryOptions(input, {
      enabled: workspaceId !== "",
      // Always ask again on a fresh mount — the whole point is to know now.
      staleTime: 0,
    }),
  );
  const [live, setLive] = useState<DashboardGeneration | null>(null);
  const [started, setStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [errorKey, setErrorKey] =
    useState<DashboardGenerationApi["errorKey"]>(null);

  const liveRow = live && live.workspaceId === workspaceId ? live : null;
  const seeded = latest.data ?? null;
  const generation = liveRow ? newer(seeded, liveRow) : seeded;
  const generationRef = useLatestRef(generation);
  const listening = workspaceId !== "" && (started || isAlive(generation));

  useSubscription(
    trpc.dashboardGeneration.onChange.subscriptionOptions(input, {
      enabled: listening,
      onData: (event) => {
        const change = event.data;
        if (change.type === "closed") {
          setStarted(false);
          return;
        }
        const next = change.generation;
        if (next) setLive((current) => newer(current, next));
      },
      onError: (error) =>
        console.error("[dashboard-generation] stream error:", error),
    }),
  );

  // The transition to `completed`, seen once per generation: refetch what
  // the worker changed and tell the caller.
  const onCompleted = useLatestRef(options?.onCompleted);
  const seen = useRef<Pick<DashboardGeneration, "id" | "status"> | null>(null);
  useEffect(() => {
    if (!generation) return;
    const previous = seen.current;
    seen.current = { id: generation.id, status: generation.status };
    if (
      generation.status !== "completed" ||
      previous?.id !== generation.id ||
      previous.status === "completed"
    ) {
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: trpc.dashboard.byWorkspace.queryKey({
        workspaceId: generation.workspaceId,
      }),
    });
    void queryClient.invalidateQueries({
      queryKey: sheetRowsQueryKey(generation.spreadsheetId),
    });
    onCompleted.current?.(generation);
  }, [generation, onCompleted, queryClient, trpc]);

  const startMutation = useMutation(
    trpc.dashboardGeneration.start.mutationOptions(),
  );
  const cancelMutation = useMutation(
    trpc.dashboardGeneration.cancel.mutationOptions(),
  );

  const { mutateAsync: startGeneration } = startMutation;
  const start = useCallback(
    async (source: GenerationSource) => {
      if (workspaceId === "") return;
      setErrorKey(null);
      setIsStarting(true);
      // Subscribe first, so the pending row's own event is the first one in.
      setStarted(true);
      try {
        const created = await startGeneration({ workspaceId, source });
        setLive((current) => newer(current, created));
      } catch (error) {
        setStarted(false);
        setErrorKey(
          generationErrorKey(
            error instanceof TRPCClientError ? error.data?.code : undefined,
          ),
        );
      } finally {
        setIsStarting(false);
      }
    },
    [startGeneration, workspaceId],
  );

  const { mutateAsync: cancelGeneration } = cancelMutation;
  const cancel = useCallback(async () => {
    const current = generationRef.current;
    if (!current || !isAlive(current)) return;
    try {
      const cancelled = await cancelGeneration({ id: current.id });
      setLive((live) => newer(live, cancelled));
    } catch {
      // It ended on its own first — the stream says so.
    }
  }, [cancelGeneration, generationRef]);

  const dismissError = useCallback(() => setErrorKey(null), []);

  return {
    generation,
    isActive: isAlive(generation),
    isStarting,
    start,
    cancel,
    errorKey,
    dismissError,
  };
}
