"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import type { CheckboxPaintState } from "@/lib/ai-spreadsheet/paint-checkbox";
import type { SheetModel } from "@/lib/ai-spreadsheet/types";
import { useTRPC } from "@/trpc/client";

export type SheetSelectionApi = {
  /** Read by the painters and hit-testing — mutated in place, never replaced. */
  selectedRef: React.RefObject<Set<number>>;
  /** State, so the header delete control re-renders as ticks change. */
  count: number;
  status: "idle" | "deleting" | "error";
  toggleRow: (row: number) => void;
  /** The header checkbox: everything stored selected → clear; else select all. */
  toggleAll: () => void;
  /** What the header checkbox should paint right now. */
  selectAllState: () => CheckboxPaintState;
  deleteSelected: () => void;
};

/** Every row index the model knows holds a stored row or a stored cell. */
function storedRows(model: SheetModel): Set<number> {
  const rows = new Set<number>(model.rowIds.keys());
  for (const key of model.cells.keys()) {
    const row = Number.parseInt(key, 10);
    if (Number.isInteger(row)) rows.add(row);
  }
  return rows;
}

/**
 * The gutter's row selection and the delete that acts on it.
 *
 * The tick set lives in a ref because ticking is a paint concern — the canvas
 * repaints, React does not re-render. Only `count` is state, and only because
 * the delete control in the header is DOM.
 *
 * Deleting follows the sheet's local-model deviation (`use-sheet-sync.ts`):
 * on success the rows are removed from the model ref and repainted — no
 * `spreadsheet.rows` invalidation, which would remount and blank the canvas.
 */
export function useSheetSelection(args: {
  modelRef: React.RefObject<SheetModel>;
  requestPaint: () => void;
  /** Runs just before the mutation: cancel edits, drop pending cell writes. */
  onBeforeDelete: () => void;
  /** Removes the rows from the local model after the server confirms. */
  removeRowsLocal: (rows: ReadonlySet<number>) => void;
}) {
  const { modelRef, requestPaint, onBeforeDelete, removeRowsLocal } = args;
  const trpc = useTRPC();

  const selectedRef = useRef(new Set<number>());
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "deleting" | "error">("idle");

  const removeRowsMutation = useMutation(
    trpc.spreadsheet.removeRows.mutationOptions(),
  );
  const mutateRef = useRef(removeRowsMutation.mutate);
  mutateRef.current = removeRowsMutation.mutate;

  const commit = useCallback(() => {
    setCount(selectedRef.current.size);
    setStatus("idle");
    requestPaint();
  }, [requestPaint]);

  const toggleRow = useCallback(
    (row: number) => {
      const selected = selectedRef.current;
      if (selected.has(row)) selected.delete(row);
      else selected.add(row);
      commit();
    },
    [commit],
  );

  const toggleAll = useCallback(() => {
    const model = modelRef.current;
    if (!model) return;
    const selected = selectedRef.current;
    const stored = storedRows(model);
    const allSelected =
      stored.size > 0 && [...stored].every((row) => selected.has(row));
    selected.clear();
    if (!allSelected) for (const row of stored) selected.add(row);
    commit();
  }, [commit, modelRef]);

  const selectAllState = useCallback((): CheckboxPaintState => {
    const selected = selectedRef.current;
    if (selected.size === 0) return "none";
    const model = modelRef.current;
    if (!model) return "some";
    const stored = storedRows(model);
    const covered =
      stored.size > 0 && [...stored].every((row) => selected.has(row));
    return covered ? "all" : "some";
  }, [modelRef]);

  const deleteSelected = useCallback(() => {
    const model = modelRef.current;
    const rows = [...selectedRef.current];
    if (!model || rows.length === 0) return;
    setStatus("deleting");
    onBeforeDelete();
    mutateRef.current(
      { id: model.sheetId, rowIndexes: rows },
      {
        onSuccess: () => {
          removeRowsLocal(new Set(rows));
          selectedRef.current.clear();
          commit();
        },
        onError: () => setStatus("error"),
      },
    );
  }, [commit, modelRef, onBeforeDelete, removeRowsLocal]);

  return {
    selectedRef,
    count,
    status,
    toggleRow,
    toggleAll,
    selectAllState,
    deleteSelected,
  } satisfies SheetSelectionApi;
}
