"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAssistant } from "@/components/assistant/assistant-provider";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { useTRPC } from "@/trpc/client";

/**
 * Registers the sheet with the assistant for as long as the grid is mounted:
 *
 * - before a run starts, the pending debounced writes are flushed — the
 *   worker reads the database, not the grid;
 * - after the assistant changed something, they are flushed again (the
 *   user's own edits survive, unlike the import's `discardPending`), the
 *   editor is reset (the active cell may be in a column that is gone), and
 *   the rows query is invalidated — the import's refresh path, which
 *   re-renders the grid in place rather than remounting it.
 */
export function useAssistantRefresh(args: {
  sheetId: string;
  flushPending: () => Promise<void>;
  onBeforeRefresh: () => void;
}): void {
  const { registerPage } = useAssistant();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const argsRef = useLatestRef(args);

  useEffect(
    () =>
      registerPage("spreadsheet", {
        beforeStart: () => argsRef.current.flushPending(),
        refresh: async () => {
          const { sheetId, flushPending, onBeforeRefresh } = argsRef.current;
          await flushPending();
          onBeforeRefresh();
          await queryClient.invalidateQueries({
            queryKey: trpc.spreadsheet.rows.queryKey({ id: sheetId }),
          });
        },
      }),
    [registerPage, queryClient, trpc, argsRef],
  );
}
