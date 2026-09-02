"use client";

import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback, useEffect, useRef } from "react";
import { applyRunChange } from "@/lib/ai-spreadsheet/run-state";
import type {
  ActiveRun,
  CellValue,
  RunAiChange,
  SheetModel,
} from "@/lib/ai-spreadsheet/types";
import { useTRPC } from "@/trpc/client";

/** One breath of the pulse halo, and how often the sheet repaints during it. */
export const RUN_PULSE_MS = 1200;
const RUN_PULSE_TICK_MS = 40;

export type SheetRunsApi = {
  /** The working run per cell, keyed like `cells` (`row:columnId`). */
  runsRef: React.RefObject<ReadonlyMap<string, ActiveRun>>;
  /** Where the pulse is in its breath, 0..1. */
  phaseRef: React.RefObject<number>;
};

type SheetRunsArgs = {
  modelRef: React.RefObject<SheetModel>;
  /** Whether the stream should be open; false means no stream and no capsules. */
  listening: boolean;
  /** Writes into the model only — the value is already persisted server-side. */
  setCellLocal: (row: number, columnId: string, value: CellValue) => void;
  requestPaint: () => void;
  /** The server ended the stream: the last working run finished. */
  onEnded: () => void;
};

/**
 * The live `runAi.onChange` stream for the open sheet, folded into the
 * capsules the canvas paints — open only while `listening`.
 *
 * Like every other piece of sheet state the runs live in a ref and repaint
 * the canvas; React never hears about a run starting or finishing. A
 * `completed` run's `result.output` is written straight into the model —
 * the API wrote the Cell row before it sent the event, so the model and the
 * database already agree and there is nothing to refetch.
 *
 * The stream is a generation, not a socket: the server ends it with `closed`
 * when the last working run finishes, and the capsules go with it. The
 * pulse is an interval, not a permanent rAF loop, and runs only while at
 * least one run is working (the caret blink's shape). tRPC reconnects a
 * dropped stream on its own with the last event id, replaying whatever was
 * missed.
 */
export function useSheetRuns({
  modelRef,
  listening,
  setCellLocal,
  requestPaint,
  onEnded,
}: SheetRunsArgs): SheetRunsApi {
  const trpc = useTRPC();
  const runsRef = useRef<ReadonlyMap<string, ActiveRun>>(new Map());
  const phaseRef = useRef(0);
  const pulseRef = useRef(0);

  const stopPulse = useCallback(() => {
    if (pulseRef.current !== 0) window.clearInterval(pulseRef.current);
    pulseRef.current = 0;
  }, []);

  const ensurePulse = useCallback(() => {
    if (pulseRef.current !== 0) return;
    pulseRef.current = window.setInterval(() => {
      if (runsRef.current.size === 0) {
        stopPulse();
        return;
      }
      phaseRef.current = (performance.now() % RUN_PULSE_MS) / RUN_PULSE_MS;
      requestPaint();
    }, RUN_PULSE_TICK_MS);
  }, [requestPaint, stopPulse]);

  useEffect(() => stopPulse, [stopPulse]);

  const clear = useCallback(() => {
    if (runsRef.current.size === 0) return;
    runsRef.current = new Map();
    stopPulse();
    requestPaint();
  }, [requestPaint, stopPulse]);

  // Not listening, no capsules.
  useEffect(() => {
    if (!listening) clear();
  }, [clear, listening]);

  const onData = useCallback(
    (event: { id: string; data: RunAiChange }) => {
      const model = modelRef.current;
      if (!model) return;
      if (event.data.type === "closed") {
        clear();
        onEnded();
        return;
      }
      const update = applyRunChange(runsRef.current, event.data, model.sheetId);
      runsRef.current = update.runs;
      for (const output of update.outputs) {
        setCellLocal(output.row, output.columnId, output.value);
      }
      if (update.runs.size > 0) ensurePulse();
      requestPaint();
    },
    [clear, ensurePulse, modelRef, onEnded, requestPaint, setCellLocal],
  );

  const sheetId = modelRef.current?.sheetId ?? "";
  useSubscription(
    trpc.runAi.onChange.subscriptionOptions(
      { spreadsheetId: sheetId },
      {
        enabled: sheetId !== "" && listening,
        onData,
        // tRPC reconnects on its own; a persistent failure is worth a line in
        // the console, and the sheet keeps working without live status.
        onError: (error) => console.error("[run-ai] stream error:", error),
      },
    ),
  );

  return { runsRef, phaseRef };
}
