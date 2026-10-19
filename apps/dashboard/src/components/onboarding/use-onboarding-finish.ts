"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  type OnboardingErrorKey,
  trpcCodeOf,
  trpcErrorKey,
} from "@/lib/onboarding/api";
import {
  toWidgetInputs,
  type WidgetDraft,
} from "@/lib/onboarding/widget-draft";
import { useTRPC } from "@/trpc/client";

/**
 * The last step, "Run AI": the cards through `dashboard.replace` (skipped
 * when there are none), then `onboarding.finish`, which starts the run-ai
 * batch and sets the flag. `user.me` is refetched last, so the gate
 * redirects to the dashboard with the workspace's config already fresh.
 * Stays pending through that refetch so the button never flickers back.
 */
export function useOnboardingFinish(
  workspaceId: string,
  spreadsheetId: string,
) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const replace = useMutation(trpc.dashboard.replace.mutationOptions());
  const finish = useMutation(trpc.onboarding.finish.mutationOptions());
  const [errorKey, setErrorKey] = useState<OnboardingErrorKey | null>(null);

  const { mutateAsync: replaceWidgets } = replace;
  const { mutateAsync: finishOnboarding } = finish;

  const run = useCallback(
    async (drafts: readonly WidgetDraft[]) => {
      if (workspaceId === "") return;
      setErrorKey(null);
      try {
        if (drafts.length > 0) {
          await replaceWidgets({
            workspaceId,
            widgets: toWidgetInputs(drafts, spreadsheetId),
          });
        }
      } catch (error) {
        setErrorKey(trpcErrorKey(trpcCodeOf(error)));
        return;
      }
      try {
        await finishOnboarding({ workspaceId });
      } catch (error) {
        const code = trpcCodeOf(error);
        if (code === "CONFLICT") {
          // Finished elsewhere already: let the gate move on.
          await queryClient.invalidateQueries({
            queryKey: trpc.user.me.queryKey(),
          });
          return;
        }
        setErrorKey(code === "BAD_GATEWAY" ? "errorRun" : trpcErrorKey(code));
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.dashboard.byWorkspace.queryKey({ workspaceId }),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.workspace.list.queryKey(),
        }),
      ]);
      await queryClient.invalidateQueries({
        queryKey: trpc.user.me.queryKey(),
      });
    },
    [
      finishOnboarding,
      queryClient,
      replaceWidgets,
      spreadsheetId,
      trpc,
      workspaceId,
    ],
  );

  return {
    run,
    isPending: replace.isPending || finish.isPending || finish.isSuccess,
    errorKey,
  };
}
