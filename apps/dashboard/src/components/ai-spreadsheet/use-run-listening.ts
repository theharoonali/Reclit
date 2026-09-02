"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTRPC } from "@/trpc/client";

export type RunListeningApi = {
  /** Whether the sheet is streaming run changes right now. */
  listening: boolean;
  /** True until the server has said whether anything is working. */
  isResolving: boolean;
  /** The Run button: opens the stream ahead of the first run. */
  start: () => void;
  /** The stream said `closed`: the last working run finished. */
  ended: () => void;
};

/**
 * Whether the sheet should be streaming, derived rather than stored: the
 * stream is open while the sheet has a run that is not completed or failed.
 *
 * On load `runAi.listActive` answers that question, so a reload resumes a
 * sheet mid-run on its own. The Run button opens the stream before the
 * first run exists (the same click will enqueue the runs one day); from then
 * on the server decides when it is over and says `closed`, which clears the
 * flag and the cached working runs so the next Run starts clean.
 */
export function useRunListening(sheetId: string): RunListeningApi {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const input = { spreadsheetId: sheetId };
  const queryKey = trpc.runAi.listActive.queryKey(input);

  const active = useQuery(
    trpc.runAi.listActive.queryOptions(input, {
      enabled: sheetId !== "",
      // Always ask again on a fresh mount — the whole point is to know now.
      staleTime: 0,
    }),
  );
  const [started, setStarted] = useState(false);

  const start = useCallback(() => setStarted(true), []);
  const ended = useCallback(() => {
    setStarted(false);
    queryClient.setQueryData(queryKey, []);
  }, [queryClient, queryKey]);

  return {
    listening: started || (active.data?.length ?? 0) > 0,
    isResolving: sheetId !== "" && active.isPending,
    start,
    ended,
  };
}
