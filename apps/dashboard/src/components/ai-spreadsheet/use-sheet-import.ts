"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { importSpreadsheet } from "@/lib/ai-spreadsheet/import-file";
import { ApiError } from "@/lib/api-fetch";
import { useTRPC } from "@/trpc/client";

export type ImportStatus = "idle" | "importing" | "error";

/**
 * Uploads a CSV/XLSX and refreshes the grid with what the server stored.
 *
 * The refresh is the delicate part. `invalidateQueries` leaves the query
 * `success` and only flips `isFetching`, so `ai-spreadsheet-loader.tsx` never
 * falls back to `LoadingState` and the grid stays mounted: the new `rows.data`
 * arrives as a fresh `payload` identity, `useSheetModel` re-normalises, and
 * `columnsVersion` drives a repaint. That is the same path `addColumn` takes.
 *
 * `resetQueries`, `removeQueries`, or changing the query key would put the
 * query back to `pending`, which unmounts the grid — and a remounted canvas is
 * a blank one. Do not "force" a refetch with a nonce in the query input.
 */
export function useSheetImport(args: {
  sheetId: string;
  discardPending: () => void;
  onBeforeRefresh: () => void;
}): {
  status: ImportStatus;
  errorCode: string | null;
  run: (file: File) => void;
} {
  const { sheetId, discardPending, onBeforeRefresh } = args;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const run = useCallback(
    (file: File) => {
      setStatus("importing");
      setErrorCode(null);
      void (async () => {
        try {
          await importSpreadsheet(sheetId, file);
        } catch (error) {
          // The server rolled the whole import back, so the sheet, the model
          // and any pending writes are all still valid. Change nothing else.
          setErrorCode(error instanceof ApiError ? error.code : "UNKNOWN");
          setStatus("error");
          return;
        }
        // Only now: a debounced write would otherwise land on the new grid,
        // find its key gone, and blank a freshly imported cell.
        discardPending();
        onBeforeRefresh();
        await queryClient.invalidateQueries({
          queryKey: trpc.spreadsheet.rows.queryKey({ id: sheetId }),
        });
        // `totalColumns` in the sheet meta is stale too. Safe: the id is
        // unchanged, so the rows query key stays identical.
        await queryClient.invalidateQueries({
          queryKey: trpc.spreadsheet.list.queryKey(),
        });
        setStatus("idle");
      })();
    },
    [discardPending, onBeforeRefresh, queryClient, sheetId, trpc],
  );

  return { status, errorCode, run };
}
