"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { previewOrder } from "@/lib/ai-spreadsheet/column-order";
import { parseShortColumnId } from "@/lib/ai-spreadsheet/short-ids";
import type {
  ApiColumn,
  SheetColumn,
  SheetModel,
} from "@/lib/ai-spreadsheet/types";
import { useTRPC } from "@/trpc/client";

/**
 * The header grip's drop. Follows the sheet's local-model deviation
 * (`use-sheet-sync.ts`): the model ref is written directly and the grid
 * re-renders via `columnsVersion` — no `spreadsheet.rows` invalidation, which
 * would remount and blank the canvas.
 *
 * **Optimistic**, unlike `use-column-remove.ts`. The column moves the instant
 * the pointer is released and the request goes out behind it, because waiting
 * for the round trip means the grid snaps back to the old order for as long as
 * it takes and then jumps forward again — the drop's one visible glitch. A
 * reorder can afford this where a delete cannot: it destroys nothing, and the
 * move is already the exact arithmetic the server will redo.
 *
 * The server still has the last word. Its response carries the whole order and
 * `applyColumnOrder` installs it, but only where it disagrees — so agreement,
 * the normal case, costs no second render. A failure restores the snapshot
 * taken before the move, so the column springs back.
 *
 * Note what is deliberately absent: no `discardPending()`. A reorder writes
 * only `sortOrder`, so no wire index moves and every debounced
 * `setCell({ rowIndex, columnIndex })` still in flight remains addressed at
 * exactly the right cell.
 */
export function useColumnReorder(args: {
  modelRef: React.RefObject<SheetModel>;
  /** Moves the columns locally — the optimistic step, and the rollback. */
  setColumnOrder: (columns: SheetColumn[]) => void;
  /** Reconciles against the order the server returned. */
  applyColumnOrder: (columns: ApiColumn[]) => void;
  /**
   * Post-move cleanup the grid owns: selection, hover, repaint. `from` is the
   * moved column's display position *before* the move, which the grid needs to
   * follow a selection the new order has shuffled out from under.
   */
  onAfterReorder: (columnId: string, from: number) => void;
}) {
  const { modelRef, setColumnOrder, applyColumnOrder, onAfterReorder } = args;
  const trpc = useTRPC();

  const reorderColumnMutation = useMutation(
    trpc.spreadsheet.reorderColumn.mutationOptions(),
  );
  const mutateRef = useRef(reorderColumnMutation.mutate);
  mutateRef.current = reorderColumnMutation.mutate;

  const reorderColumn = useCallback(
    (columnId: string, newSortOrder: number) => {
      const model = modelRef.current;
      const columnIndex = parseShortColumnId(columnId);
      if (!model || columnIndex === null) return;
      const from = model.columns.findIndex((column) => column.id === columnId);
      if (from < 0) return;

      // Held for the rollback: `setColumnOrder` replaces the array rather than
      // mutating it, so this stays the pre-drop order.
      const snapshot = model.columns;
      setColumnOrder(previewOrder(snapshot, from, newSortOrder));
      onAfterReorder(columnId, from);

      mutateRef.current(
        { id: model.sheetId, columnIndex, newSortOrder },
        {
          onSuccess: applyColumnOrder,
          onError: () => {
            setColumnOrder(snapshot);
            // The column is going back, so the selection follows it back: it
            // now sits at `newSortOrder` and lands at `from`.
            onAfterReorder(columnId, newSortOrder);
          },
        },
      );
    },
    [applyColumnOrder, modelRef, onAfterReorder, setColumnOrder],
  );

  return { reorderColumn };
}
