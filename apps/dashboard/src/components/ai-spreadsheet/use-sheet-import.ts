"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { SheetImportPreview } from "@/lib/ai-spreadsheet/import-file";
import {
  importSpreadsheet,
  previewImport,
} from "@/lib/ai-spreadsheet/import-file";
import { ApiError } from "@/lib/api-fetch";
import { useTRPC } from "@/trpc/client";

export type ImportStatus = "idle" | "reading" | "importing" | "error";

/** A file the server has read but nothing has been written for yet. */
export type PendingImport = { file: File; preview: SheetImportPreview };

export type SheetImport = {
  status: ImportStatus;
  errorCode: string | null;
  pending: PendingImport | null;
  /** Reads the file server-side and opens the preview. Writes nothing. */
  pick: (file: File) => void;
  /** Merges the previewed file into the sheet. */
  confirm: () => void;
  cancel: () => void;
};

/**
 * Previews a CSV/XLSX/DOCX upload, then merges it and refreshes the grid with
 * what the server stored. The preview is stateless on the server: confirming
 * uploads the same file again and the server re-plans it, against the same
 * columns unless someone changed them in between.
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
  flushPending: () => Promise<void>;
  onBeforeRefresh: () => void;
}): SheetImport {
  const { sheetId, flushPending, onBeforeRefresh } = args;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);

  const fail = useCallback((error: unknown) => {
    setErrorCode(error instanceof ApiError ? error.code : "UNKNOWN");
    setStatus("error");
  }, []);

  const pick = useCallback(
    (file: File) => {
      setStatus("reading");
      setErrorCode(null);
      void previewImport(sheetId, file).then((preview) => {
        setPending({ file, preview });
        setStatus("idle");
      }, fail);
    },
    [fail, sheetId],
  );

  const confirm = useCallback(() => {
    if (!pending) return;
    setStatus("importing");
    setErrorCode(null);
    void (async () => {
      try {
        // An import only adds, so unsaved edits stay valid — persist them
        // first, so the server appends below every row the user can see.
        await flushPending();
        await importSpreadsheet(sheetId, pending.file);
      } catch (error) {
        // The server rolled the whole import back, so the sheet, the model
        // and any pending writes are all still valid. Change nothing else.
        setPending(null);
        fail(error);
        return;
      }
      setPending(null);
      // Edits typed while the import ran: persisted before the refetch, so
      // the refreshed model does not paint over them.
      await flushPending();
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
  }, [
    fail,
    flushPending,
    onBeforeRefresh,
    pending,
    queryClient,
    sheetId,
    trpc,
  ]);

  const cancel = useCallback(() => setPending(null), []);

  return { status, errorCode, pending, pick, confirm, cancel };
}
