"use client";

import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useState } from "react";
import { parseShortColumnId } from "@/lib/ai-spreadsheet/short-ids";
import type {
  ActiveRun,
  EditorState,
  RunAi,
  SheetColumn,
  SheetModel,
} from "@/lib/ai-spreadsheet/types";
import { cellKey } from "@/lib/ai-spreadsheet/types";
import { useTRPC } from "@/trpc/client";

export type RunCellStatus = "idle" | "running" | "error";

export type RunCellApi = {
  /** The selected cell can be run: an AI column with a prompt, not already working. */
  runnable: boolean;
  status: RunCellStatus;
  /** The tRPC code of the last refusal (`CONFLICT` = the cell is busy), or null. */
  errorCode: string | null;
  /** Recompute `runnable` — after the selection, the runs, or the columns change. */
  refresh: () => void;
  /** Run the selected cell. */
  run: () => Promise<void>;
};

type RunCellArgs = {
  modelRef: React.RefObject<SheetModel>;
  editorRef: React.RefObject<EditorState>;
  runsRef: React.RefObject<ReadonlyMap<string, ActiveRun>>;
  /** Persists every pending cell edit before the API reads the row. */
  flushPending: () => Promise<void>;
  /** Opens the run stream ahead of the run's first event. */
  onStart: () => void;
  /** The run was refused: undo `onStart`. */
  onCancel: () => void;
  /** Paints the returned pending run before the stream reports it. */
  seedRun: (run: RunAi) => void;
};

/**
 * The Run button's brain: which cell it would run, whether it may, and the
 * `runAi.runCell` call itself.
 *
 * `runnable` is React state but recomputed only when told to (`refresh`),
 * from refs — the editor's active cell and the working runs — so the grid is
 * not re-rendered per keystroke; React bails out when the boolean is
 * unchanged. A run needs the *persisted* row (the API reads the database,
 * not this model), so pending edits are flushed and awaited first.
 */
export function useRunCell(args: RunCellArgs): RunCellApi {
  const { modelRef, editorRef, runsRef, flushPending } = args;
  const { onStart, onCancel, seedRun } = args;
  const trpc = useTRPC();
  const { mutateAsync } = useMutation(trpc.runAi.runCell.mutationOptions());
  const [runnable, setRunnable] = useState(false);
  const [status, setStatus] = useState<RunCellStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  /** The selected cell as a run target, or null when it cannot be run. */
  const target = useCallback((): {
    row: number;
    column: SheetColumn;
  } | null => {
    const model = modelRef.current;
    const active = editorRef.current.active;
    if (!model || !active) return null;
    const column = model.columns[active.col];
    if (!column || column.node !== "ai" || column.prompt === null) return null;
    if (runsRef.current.has(cellKey(active.row, column.id))) return null;
    return { row: active.row, column };
  }, [editorRef, modelRef, runsRef]);

  const refresh = useCallback(() => {
    setRunnable(target() !== null);
  }, [target]);

  const run = useCallback(async () => {
    const model = modelRef.current;
    const cell = target();
    const columnIndex = cell ? parseShortColumnId(cell.column.id) : null;
    if (!model || !cell || columnIndex === null) return;
    setStatus("running");
    setErrorCode(null);
    try {
      await flushPending();
      onStart();
      const created = await mutateAsync({
        id: model.sheetId,
        rowIndex: cell.row,
        columnIndex,
      });
      seedRun(created);
      setStatus("idle");
    } catch (error) {
      onCancel();
      setErrorCode(
        error instanceof TRPCClientError
          ? (error.data?.code ?? "UNKNOWN")
          : "UNKNOWN",
      );
      setStatus("error");
    }
    refresh();
  }, [
    flushPending,
    modelRef,
    mutateAsync,
    onCancel,
    onStart,
    refresh,
    seedRun,
    target,
  ]);

  return { runnable, status, errorCode, refresh, run };
}
