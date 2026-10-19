"use client";

import type { RouterOutputs } from "@reclit/api/trpc/routers/_app";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback, useState } from "react";
import { useReseed } from "@/hooks/use-reseed";
import type { RunAiChange } from "@/lib/ai-spreadsheet/types";
import {
  applyOutputChange,
  isOutputWorking,
  type OutputColumn,
  type OutputState,
  seedOutputs,
  waitingOutputs,
} from "@/lib/public-form-output";
import { useTRPC } from "@/trpc/client";

export type PublicFormSubmission = RouterOutputs["populate"]["submit"];

/**
 * The output column's state: waiting until a submission, then seeded from
 * the runs the submit answered and followed on the sheet's `runAi.onChange`
 * stream — open only while one of the row's cells is working. The stream is
 * per sheet; the reducer keeps the row's events and ignores the rest.
 */
export function usePublicFormOutput(
  sheetId: string,
  submission: PublicFormSubmission | null,
  outputs: readonly OutputColumn[],
) {
  const trpc = useTRPC();
  const rowIndex = submission?.row.index ?? -1;
  const seed = (next: PublicFormSubmission | null): OutputState =>
    next
      ? seedOutputs(outputs, next.runs, { sheetId, rowIndex: next.row.index })
      : waitingOutputs(outputs);
  const [state, setState] = useState<OutputState>(() => seed(submission));
  useReseed(submission, (next) => setState(seed(next)));

  const listening = submission !== null && isOutputWorking(state);
  const onData = useCallback(
    (event: { id: string; data: RunAiChange }) =>
      setState((current) =>
        applyOutputChange(current, event.data, { sheetId, rowIndex }),
      ),
    [sheetId, rowIndex],
  );

  useSubscription(
    trpc.runAi.onChange.subscriptionOptions(
      { spreadsheetId: sheetId },
      {
        enabled: listening,
        onData,
        onError: (error) => console.error("[run-ai] stream error:", error),
      },
    ),
  );

  return { state, isWorking: listening };
}
