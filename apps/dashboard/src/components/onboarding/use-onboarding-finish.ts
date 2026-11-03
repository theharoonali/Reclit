"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useDashboardGeneration } from "@/components/dashboard/use-dashboard-generation";
import { ONBOARDING_RUN_ROW_LIMIT } from "@/config/onboarding";
import { isTerminalGeneration } from "@/lib/dashboard/generation";
import {
  type OnboardingErrorKey,
  trpcCodeOf,
  trpcErrorKey,
} from "@/lib/onboarding/api";
import { useTRPC } from "@/trpc/client";

/**
 * The last step: `onboarding.finish { rowLimit: 10 }` runs the AI columns
 * over the first rows, sets the flag and starts the dashboard generation.
 * The dashboard config and the workspace list are refetched at once, and
 * `dashboardGeneration.latest` so the live row (and its stream) arrives;
 * `user.me` is refetched — the gate then replaces the route with `/` — only
 * when there is nothing to watch: the generation completed, or none could be
 * started. A failed or cancelled generation stays on screen with its message
 * until the user goes to the dashboard. CONFLICT (finished elsewhere) moves
 * the gate on at once; a dispatch failure keeps the flag false so the step
 * can be retried.
 */
export function useOnboardingFinish(workspaceId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const finish = useMutation(trpc.onboarding.finish.mutationOptions());
  const [errorKey, setErrorKey] = useState<OnboardingErrorKey | null>(null);
  const [answer, setAnswer] = useState<{ generationId: string | null } | null>(
    null,
  );

  const goToDashboard = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.user.me.queryKey() }),
    [queryClient, trpc],
  );

  const generation = useDashboardGeneration(workspaceId, {
    onCompleted: () => void goToDashboard(),
  });

  const { mutateAsync: finishOnboarding } = finish;

  const run = useCallback(async () => {
    if (workspaceId === "") return;
    setErrorKey(null);
    let result: Awaited<ReturnType<typeof finishOnboarding>>;
    try {
      result = await finishOnboarding({
        workspaceId,
        rowLimit: ONBOARDING_RUN_ROW_LIMIT,
      });
    } catch (error) {
      const code = trpcCodeOf(error);
      if (code === "CONFLICT") {
        await goToDashboard();
        return;
      }
      setErrorKey(code === "BAD_GATEWAY" ? "errorRun" : trpcErrorKey(code));
      return;
    }
    setAnswer({ generationId: result.generationId });
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.dashboardGeneration.latest.queryKey({ workspaceId }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.dashboard.byWorkspace.queryKey({ workspaceId }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.workspace.list.queryKey(),
      }),
    ]);
    if (result.generationId === null) await goToDashboard();
  }, [finishOnboarding, goToDashboard, queryClient, trpc, workspaceId]);

  const row = generation.generation;
  const isStopped = row !== null && isTerminalGeneration(row);

  return {
    run,
    /** `finish` is in flight. */
    isRunning: finish.isPending,
    /** `finish` answered; `generationId` says whether there is a generation to follow. */
    isFinished: answer !== null,
    generationId: answer?.generationId ?? null,
    generation: row,
    /** The generation exists and has not ended. */
    isActive: generation.isActive,
    /** The generation ended without completing, or none could be started. */
    hasGenerationFailed:
      (isStopped && row.status !== "completed") ||
      (answer !== null && answer.generationId === null),
    /** The screen may leave: the generation ended, or there is none to wait for. */
    canLeave: answer !== null && (answer.generationId === null || isStopped),
    errorKey,
    cancelGeneration: generation.cancel,
    goToDashboard,
  };
}
