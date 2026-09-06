"use client";

import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useState } from "react";
import type { RunPlan } from "@/lib/ai-spreadsheet/run-targets";
import {
  planRunTargets,
  selectionRect,
} from "@/lib/ai-spreadsheet/run-targets";
import type {
  ActiveRun,
  EditorState,
  RunAi,
  SheetModel,
} from "@/lib/ai-spreadsheet/types";
import { useTRPC } from "@/trpc/client";

export type RunCellsStatus = "idle" | "running" | "error";

export type RunCellsApi = {
  /** The selection holds at least one AI cell with a prompt, and none of them is working. */
  runnable: boolean;
  /** How many AI cells the selection would run. */
  count: number;
  status: RunCellsStatus;
  /**
   * The tRPC code of the last refusal (`CONFLICT` = a cell is busy),
   * `TOO_LARGE` for a selection over the caps (refused before any request),
   * or null.
   */
  errorCode: string | null;
  /** Recompute `runnable` and `count` — after the selection, the runs, or the columns change. */
  refresh: () => void;
  /** Run the selected cells. */
  run: () => Promise<void>;
};

type RunCellsArgs = {
  modelRef: React.RefObject<SheetModel>;
  editorRef: React.RefObject<EditorState>;
  runsRef: React.RefObject<ReadonlyMap<string, ActiveRun>>;
  /** Persists every pending cell edit before the API reads the rows. */
  flushPending: () => Promise<void>;
  /** Opens the run stream ahead of the first event. */
  onStart: () => void;
  /** The runs were refused: undo `onStart`. */
  onCancel: () => void;
  /** Paints the returned pending runs before the stream reports them. */
  seedRuns: (runs: RunAi[]) => void;
};

/**
 * The Run button's brain: which cells it would run, whether it may, and the
 * `runAi.runCells` call itself.
 *
 * `runnable` and `count` are React state but recomputed only when told to
 * (`refresh`), from refs — the editor's rectangle and the working runs — so
 * the grid is not re-rendered per keystroke; React bails out when neither
 * changed. The API refuses the whole batch when any target is busy, so the
 * button follows the same rule. The runs need the *persisted* rows (the
 * worker reads the database, not this model), so pending edits are flushed
 * and awaited first.
 */
export function useRunCells(args: RunCellsArgs): RunCellsApi {
  const { modelRef, editorRef, runsRef, flushPending } = args;
  const { onStart, onCancel, seedRuns } = args;
  const trpc = useTRPC();
  const { mutateAsync } = useMutation(trpc.runAi.runCells.mutationOptions());
  const [runnable, setRunnable] = useState(false);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<RunCellsStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);

  /** The selection as a run plan, or null without one. */
  const plan = useCallback((): RunPlan | null => {
    const model = modelRef.current;
    const { active, anchor } = editorRef.current;
    if (!model || !active) return null;
    return planRunTargets(
      model.columns,
      selectionRect(active, anchor),
      runsRef.current,
    );
  }, [editorRef, modelRef, runsRef]);

  const refresh = useCallback(() => {
    const targets = plan();
    setCount(targets?.count ?? 0);
    setRunnable(
      targets !== null && targets.count > 0 && targets.busyCount === 0,
    );
  }, [plan]);

  const run = useCallback(async () => {
    const model = modelRef.current;
    const targets = plan();
    if (!model || !targets || targets.count === 0 || targets.busyCount > 0) {
      return;
    }
    setErrorCode(null);
    if (targets.tooLarge) {
      setErrorCode("TOO_LARGE");
      setStatus("error");
      return;
    }
    setStatus("running");
    try {
      await flushPending();
      onStart();
      const created = await mutateAsync({
        id: model.sheetId,
        rowIndexes: targets.rowIndexes,
        columnIndexes: targets.columnIndexes,
      });
      seedRuns(created);
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
    plan,
    refresh,
    seedRuns,
  ]);

  return { runnable, count, status, errorCode, refresh, run };
}
