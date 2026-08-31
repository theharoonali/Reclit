"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { parseShortColumnId } from "@/lib/ai-spreadsheet/short-ids";
import type { SheetModel } from "@/lib/ai-spreadsheet/types";
import { useTRPC } from "@/trpc/client";

/**
 * The header's per-column delete. Follows the sheet's local-model deviation
 * (`use-sheet-sync.ts`): on success the column is dropped from the model ref
 * and the grid re-renders via `columnsVersion` — no `spreadsheet.rows`
 * invalidation, which would remount and blank the canvas. On failure the
 * model is left untouched, so the grid never shows a delete that did not
 * happen.
 */
export function useColumnRemove(args: {
  modelRef: React.RefObject<SheetModel>;
  /** Runs just before the mutation: cancel edits, drop pending cell writes. */
  onBeforeRemove: () => void;
  /** Drops the column from the local model after the server confirms. */
  removeColumnLocal: (columnId: string) => void;
  /** Post-delete cleanup the grid owns: panel, selection, hover, repaint. */
  onAfterRemove: (columnId: string) => void;
}) {
  const { modelRef, onBeforeRemove, removeColumnLocal, onAfterRemove } = args;
  const trpc = useTRPC();

  const removeColumnMutation = useMutation(
    trpc.spreadsheet.removeColumn.mutationOptions(),
  );
  const mutateRef = useRef(removeColumnMutation.mutate);
  mutateRef.current = removeColumnMutation.mutate;

  const removeColumn = useCallback(
    (columnId: string) => {
      const model = modelRef.current;
      const columnIndex = parseShortColumnId(columnId);
      if (!model || columnIndex === null) return;
      // A pending debounced write into the deleted column would flush into a
      // sheet that no longer has it and 404; an active edit could do the same.
      onBeforeRemove();
      mutateRef.current(
        { id: model.sheetId, columnIndex },
        {
          onSuccess: () => {
            removeColumnLocal(columnId);
            onAfterRemove(columnId);
          },
        },
      );
    },
    [modelRef, onAfterRemove, onBeforeRemove, removeColumnLocal],
  );

  return { removeColumn };
}
