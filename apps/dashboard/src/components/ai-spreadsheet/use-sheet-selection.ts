"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  type RowRange,
  rowCountOf,
  selectedRowRanges,
  storedRowsIn,
} from "@/lib/ai-spreadsheet/row-selection";
import type { SheetModel } from "@/lib/ai-spreadsheet/types";
import { useTRPC } from "@/trpc/client";
import type { CellEditorApi } from "./use-cell-editor";

export type SheetSelectionApi = {
  /** The whole-row selection as merged ranges, or null while an area leaves a column out. */
  rows: RowRange[] | null;
  /** How many rows that is — the header's "N rows selected"; 0 without one. */
  count: number;
  status: "idle" | "deleting" | "error";
  /** Re-derives `rows` from the editor — after the selection or the columns change. */
  refresh: () => void;
  deleteSelected: () => void;
};

const sameRanges = (a: RowRange[] | null, b: RowRange[] | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.length === b.length &&
    a.every(
      (range, i) => range.first === b[i]?.first && range.last === b[i]?.last,
    ));

/**
 * The sheet's row selection and the delete that acts on it.
 *
 * There is no row-selection state of its own: a row selection is the editor's
 * selection when every area spans every column (`row-selection.ts`), so this
 * hook only mirrors those rows into React state — the header's delete control
 * is DOM and has to re-render — and owns the mutation. `refresh` runs from the
 * editor's `onSelectionChange` and when the columns change, never per paint.
 *
 * Deleting follows the sheet's local-model deviation (`use-sheet-sync.ts`):
 * on success the rows are removed from the model ref and repainted — no
 * `spreadsheet.rows` invalidation, which would remount and blank the canvas.
 */
export function useSheetSelection(args: {
  modelRef: React.RefObject<SheetModel>;
  editor: Pick<CellEditorApi, "editorRef" | "clearSelection">;
  /** Runs just before the mutation: cancel edits, drop pending cell writes. */
  onBeforeDelete: () => void;
  /** Removes the rows from the local model after the server confirms. */
  removeRowsLocal: (rows: ReadonlySet<number>) => void;
}): SheetSelectionApi {
  const { modelRef, onBeforeDelete, removeRowsLocal } = args;
  const { editorRef, clearSelection } = args.editor;
  const trpc = useTRPC();

  const [rows, setRows] = useState<RowRange[] | null>(null);
  const [status, setStatus] = useState<"idle" | "deleting" | "error">("idle");

  const removeRowsMutation = useMutation(
    trpc.spreadsheet.removeRows.mutationOptions(),
  );
  const mutateRef = useRef(removeRowsMutation.mutate);
  mutateRef.current = removeRowsMutation.mutate;

  const refresh = useCallback(() => {
    const columnCount = modelRef.current?.columns.length ?? 0;
    const next = selectedRowRanges(editorRef.current, columnCount);
    // The same rows keep the same state object, so React bails out of the render.
    setRows((current) => (sameRanges(current, next) ? current : next));
    // A new selection is a fresh start; a stale failure must not follow it.
    setStatus((current) => (current === "error" ? "idle" : current));
  }, [editorRef, modelRef]);

  const deleteSelected = useCallback(() => {
    const model = modelRef.current;
    if (!model || !rows) return;
    const indexes = storedRowsIn(model, rows);
    // Blank rows have nothing to remove, and the API rejects an empty list.
    if (indexes.length === 0) return;
    setStatus("deleting");
    onBeforeDelete();
    mutateRef.current(
      { id: model.sheetId, rowIndexes: indexes },
      {
        onSuccess: () => {
          removeRowsLocal(new Set(indexes));
          // Clearing repaints the blanked rows and withdraws the row controls.
          clearSelection();
          setStatus("idle");
        },
        onError: () => setStatus("error"),
      },
    );
  }, [clearSelection, modelRef, onBeforeDelete, removeRowsLocal, rows]);

  return {
    rows,
    count: rows ? rowCountOf(rows) : 0,
    status,
    refresh,
    deleteSelected,
  };
}
