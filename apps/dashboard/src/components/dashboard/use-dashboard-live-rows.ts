"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTerminalRunStatus } from "@/lib/ai-spreadsheet/run-status";
import type { RunAi, RunAiChange } from "@/lib/ai-spreadsheet/types";
import { sheetRowsQueryKey } from "@/lib/dashboard/sheet-rows-query";
import { useTRPC } from "@/trpc/client";

/** How long completed runs are batched before the sheet rows are refetched. */
const REFRESH_DEBOUNCE_MS = 1000;

/** While nothing is working, how often the page asks whether a batch started elsewhere. */
const IDLE_POLL_MS = 15_000;

/**
 * Keeps the dashboard's figures moving while AI runs fill the sheet — the
 * onboarding wizard's "Run AI" lands here with a batch in flight, and the
 * sheet page or the assistant may start one while this page is open.
 * `runAi.listActive` says whether anything is working (on load, on focus,
 * and every few seconds while idle); while it does, the `runAi.onChange`
 * stream is open and every completed run schedules one refetch of the sheet
 * rows (debounced, so a burst costs one fetch). The server ends the stream
 * with `closed` when the last run finishes; the next batch reopens it.
 */
export function useDashboardLiveRows(sheetId: string): {
  isFilling: boolean;
  pendingCount: number;
} {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const input = { spreadsheetId: sheetId };
  const activeKey = trpc.runAi.listActive.queryKey(input);
  const [pending, setPending] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const [streaming, setStreaming] = useState(false);

  const active = useQuery(
    trpc.runAi.listActive.queryOptions(input, {
      enabled: sheetId !== "",
      staleTime: 0,
      // The stream reports every change while it is open; between batches
      // the page checks on its own whether a new one started elsewhere.
      refetchInterval: streaming ? false : IDLE_POLL_MS,
    }),
  );
  const listening = sheetId !== "" && (active.data?.length ?? 0) > 0;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchRows = useCallback(
    () =>
      queryClient.invalidateQueries({ queryKey: sheetRowsQueryKey(sheetId) }),
    [queryClient, sheetId],
  );
  const scheduleRefetch = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      refetchRows();
    }, REFRESH_DEBOUNCE_MS);
  }, [refetchRows]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onData = useCallback(
    (event: { id: string; data: RunAiChange }) => {
      if (event.data.type === "closed") {
        setStreaming(false);
        setPending(new Map());
        // Confirmed empty by the server; a refetch finds a batch that began
        // in the meantime and reopens the stream.
        queryClient.setQueryData(activeKey, []);
        queryClient.invalidateQueries({ queryKey: activeKey });
        refetchRows();
        return;
      }
      setStreaming(true);
      const runs: RunAi[] =
        event.data.type === "snapshot" ? event.data.runs : [event.data.run];
      setPending((current) => {
        const next = new Map(current);
        for (const run of runs) {
          if (isTerminalRunStatus(run.status)) next.delete(run.id);
          else next.set(run.id, run.status);
        }
        return next;
      });
      if (runs.some((run) => run.status === "completed")) scheduleRefetch();
    },
    [activeKey, queryClient, refetchRows, scheduleRefetch],
  );

  useSubscription(
    trpc.runAi.onChange.subscriptionOptions(input, {
      enabled: listening,
      onData,
      onError: (error) => console.error("[run-ai] stream error:", error),
    }),
  );

  const pendingCount = listening
    ? pending.size > 0
      ? pending.size
      : (active.data?.length ?? 0)
    : 0;
  return { isFilling: pendingCount > 0, pendingCount };
}
