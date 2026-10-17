"use client";

import { useEffect, useRef } from "react";
import { RESULT_CANCELLED_MS, RESULT_DONE_MS } from "@/config/assistant";
import { useLatestRef } from "@/hooks/use-latest-ref";
import { isTerminalStatus } from "@/lib/assistant/island-state";
import type { AssistantRun } from "@/lib/assistant/types";

/** Several mutating steps landing in a burst refresh the page once. */
const REFRESH_DEBOUNCE_MS = 500;

/**
 * What happens around a run, independent of where the run comes from:
 *
 * - the page is refreshed after every mutating step that finished (debounced)
 *   and once more when the run ends, so the sheet or the dashboard shows what
 *   the assistant did;
 * - a completed run dismisses itself after `RESULT_DONE_MS`, a cancelled one
 *   after `RESULT_CANCELLED_MS`; a failed run stays until dismissed.
 */
export function useRunLifecycle(
  run: AssistantRun | null,
  handlers: { onRefresh: () => void; onDismiss: () => void },
) {
  const handlersRef = useLatestRef(handlers);
  const refreshedRunId = useRef<string | null>(null);

  const runId = run?.id ?? null;
  const status = run?.status ?? null;
  const mutatedDone = run
    ? run.steps.filter((step) => step.status === "done" && step.mutated).length
    : 0;

  useEffect(() => {
    if (mutatedDone === 0) return;
    const timer = setTimeout(
      () => handlersRef.current.onRefresh(),
      REFRESH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [runId, mutatedDone]);

  useEffect(() => {
    if (!runId || !status || !isTerminalStatus(status)) return;
    if (refreshedRunId.current !== runId) {
      refreshedRunId.current = runId;
      handlersRef.current.onRefresh();
    }
    const delay =
      status === "completed"
        ? RESULT_DONE_MS
        : status === "cancelled"
          ? RESULT_CANCELLED_MS
          : null;
    if (delay === null) return;
    const timer = setTimeout(() => handlersRef.current.onDismiss(), delay);
    return () => clearTimeout(timer);
  }, [runId, status]);
}
