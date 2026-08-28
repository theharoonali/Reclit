"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { isMistyped } from "@/lib/ai-spreadsheet/cell-format";
import { parseShortColumnId } from "@/lib/ai-spreadsheet/short-ids";
import type {
  CellValue,
  ColumnType,
  SheetModel,
} from "@/lib/ai-spreadsheet/types";
import { cellKey } from "@/lib/ai-spreadsheet/types";
import { useTRPC } from "@/trpc/client";
import type { SheetModelApi } from "./use-sheet-model";

const COALESCE_MS = 400;

type DirtyCell = {
  timer: ReturnType<typeof setTimeout>;
  /** The value before the cell first went dirty — restored on failure. */
  snapshot: CellValue;
};

export type SheetSyncApi = {
  /** Drop-in for the model's `setCell`: mutates the ref, then persists. */
  setCell: (row: number, columnId: string, value: CellValue) => void;
  syncColumnCreate: (name: string, type: ColumnType) => void;
  syncColumnUpdate: (columnId: string, name: string, type: ColumnType) => void;
  /**
   * Drops every pending cell write *without* sending it, and disowns any
   * response still in flight. The deliberate opposite of the unmount effect,
   * which flushes.
   *
   * An import wipes and rebuilds the grid. A debounced flush landing after it
   * would read a key the new model does not have, send `value: null` into the
   * freshly imported sheet, and — if that write failed — restore a *pre*-import
   * snapshot into a *post*-import model.
   */
  discardPending: () => void;
};

/**
 * Persists grid edits without ever re-rendering the grid.
 *
 * The mutations deliberately do NOT invalidate `spreadsheet.rows` (a recorded
 * deviation from the mutations-invalidate rule): a refetch would hand the grid
 * a new payload prop, which re-normalises the model and remounts — blanks —
 * the canvas. After an edit the mutated model ref already is the truth; the
 * server was just told the same thing.
 *
 * Rapid edits to one cell coalesce on a trailing debounce, latest value wins.
 * On failure the cell's pre-dirty snapshot is written back and repainted —
 * there is no toast system to announce it yet. Values the column type rejects
 * (`isMistyped`) stay local: the grid paints them as invalid and the server
 * never sees a value it would refuse.
 *
 * The one exception to the no-invalidation rule is **import**
 * (`use-sheet-import.ts`), which *replaces* the sheet rather than editing it:
 * there the server is the truth and the model must be rebuilt, so it
 * invalidates `spreadsheet.rows` on purpose. That is safe because
 * `invalidateQueries` leaves the query `success` — the loader never falls back
 * to `LoadingState`, so the grid re-renders instead of remounting.
 * `resetQueries`, `removeQueries` or a changed query key would remount it, and
 * a remounted canvas is a blank one.
 */
export function useSheetSync(args: {
  modelRef: React.RefObject<SheetModel>;
  setCellLocal: SheetModelApi["setCell"];
  requestPaint: () => void;
}): SheetSyncApi {
  const { modelRef, setCellLocal, requestPaint } = args;
  const trpc = useTRPC();

  const setCellMutation = useMutation(
    trpc.spreadsheet.setCell.mutationOptions(),
  );
  const createColumnMutation = useMutation(
    trpc.spreadsheet.createColumn.mutationOptions(),
  );
  const updateColumnMutation = useMutation(
    trpc.spreadsheet.updateColumn.mutationOptions(),
  );

  const dirtyRef = useRef(new Map<string, DirtyCell>());
  // Bumped by `discardPending` so responses sent before it are ignored.
  const generationRef = useRef(0);

  // The debounce closes over these refs, not the mutation objects, so the
  // callbacks stay referentially stable for the canvas wiring.
  const mutateCellRef = useRef(setCellMutation.mutate);
  mutateCellRef.current = setCellMutation.mutate;
  const mutateCreateRef = useRef(createColumnMutation.mutate);
  mutateCreateRef.current = createColumnMutation.mutate;
  const mutateUpdateRef = useRef(updateColumnMutation.mutate);
  mutateUpdateRef.current = updateColumnMutation.mutate;

  const flushCell = useCallback(
    (row: number, columnId: string) => {
      const model = modelRef.current;
      const key = cellKey(row, columnId);
      const dirty = dirtyRef.current.get(key);
      const columnIndex = parseShortColumnId(columnId);
      if (!model || !dirty || columnIndex === null) return;
      dirtyRef.current.delete(key);
      const value = model.cells.get(key) ?? null;
      // Captured at send time: `discardPending` cannot cancel a request that is
      // already out, so the generation is how a superseded response is ignored.
      const generation = generationRef.current;
      mutateCellRef.current(
        { id: model.sheetId, rowIndex: row, columnIndex, value },
        {
          onError: () => {
            // An import replaced the model out from under this write; its
            // snapshot belongs to a sheet that no longer exists.
            if (generationRef.current !== generation) return;
            // Snap the cell back to what the server last accepted.
            setCellLocal(row, columnId, dirty.snapshot);
            requestPaint();
          },
        },
      );
    },
    [modelRef, requestPaint, setCellLocal],
  );

  const setCell = useCallback(
    (row: number, columnId: string, value: CellValue) => {
      const model = modelRef.current;
      const key = cellKey(row, columnId);
      const snapshot = model?.cells.get(key) ?? null;
      setCellLocal(row, columnId, value);
      const column = model?.columns.find((c) => c.id === columnId);
      // Mistyped text stays local-only — painted invalid, never persisted.
      if (
        !model ||
        !column ||
        (value !== null && isMistyped(value, column.type))
      ) {
        return;
      }
      const dirty = dirtyRef.current.get(key);
      if (dirty) clearTimeout(dirty.timer);
      dirtyRef.current.set(key, {
        timer: setTimeout(() => flushCell(row, columnId), COALESCE_MS),
        // Keep the first snapshot: reverting lands on the last synced value.
        snapshot: dirty ? dirty.snapshot : snapshot,
      });
    },
    [flushCell, modelRef, setCellLocal],
  );

  // Column ops fire immediately: they already re-render via columnsVersion,
  // and the optimistic `col.<nextColumnIndex>` id matches the server's
  // append-only id, so success needs no reconciliation.
  const syncColumnCreate = useCallback(
    (name: string, type: ColumnType) => {
      const model = modelRef.current;
      if (!model) return;
      mutateCreateRef.current({ id: model.sheetId, name, type });
    },
    [modelRef],
  );

  const syncColumnUpdate = useCallback(
    (columnId: string, name: string, type: ColumnType) => {
      const model = modelRef.current;
      const columnIndex = parseShortColumnId(columnId);
      if (!model || columnIndex === null) return;
      mutateUpdateRef.current({ id: model.sheetId, columnIndex, name, type });
    },
    [modelRef],
  );

  // Flush pending edits when the sheet unmounts.
  useEffect(() => {
    return () => {
      for (const key of [...dirtyRef.current.keys()]) {
        clearTimeout(dirtyRef.current.get(key)?.timer);
        const [row, columnId] = key.split(/:(.*)/s);
        if (row !== undefined && columnId) {
          flushCell(Number.parseInt(row, 10), columnId);
        }
      }
    };
  }, [flushCell]);

  const discardPending = useCallback(() => {
    for (const dirty of dirtyRef.current.values()) clearTimeout(dirty.timer);
    dirtyRef.current.clear();
    generationRef.current += 1;
  }, []);

  return { setCell, syncColumnCreate, syncColumnUpdate, discardPending };
}
