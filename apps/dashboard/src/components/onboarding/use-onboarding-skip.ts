"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { storeActiveWorkspaceId } from "@/components/workspace/workspace-provider";
import {
  type OnboardingErrorKey,
  trpcCodeOf,
  trpcErrorKey,
} from "@/lib/onboarding/api";
import { useTRPC } from "@/trpc/client";

/**
 * Skip from the upload screen: `onboarding.skip { name }` creates the named,
 * empty workspace and sets the flag. The new workspace becomes the active
 * one, `workspace.list` is refetched, then `user.me` — the gate replaces the
 * route with `/`, where the dashboard shows its empty state. Stays "skipping"
 * through that refetch so the buttons never come back to life. "Already
 * completed" (another tab finished first) refetches `user.me` just the same.
 */
export function useOnboardingSkip() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const skip = useMutation(trpc.onboarding.skip.mutationOptions());
  const [errorKey, setErrorKey] = useState<OnboardingErrorKey | null>(null);

  const { mutateAsync: skipOnboarding } = skip;

  const run = useCallback(
    async (name: string) => {
      if (name === "") return;
      setErrorKey(null);
      try {
        const result = await skipOnboarding({ name });
        storeActiveWorkspaceId(result.workspace.id);
        await queryClient.invalidateQueries({
          queryKey: trpc.workspace.list.queryKey(),
        });
      } catch (error) {
        const code = trpcCodeOf(error);
        if (code !== "CONFLICT") {
          setErrorKey(trpcErrorKey(code));
          return;
        }
      }
      await queryClient.invalidateQueries({
        queryKey: trpc.user.me.queryKey(),
      });
    },
    [queryClient, skipOnboarding, trpc],
  );

  return {
    run,
    isPending: skip.isPending || skip.isSuccess,
    errorKey,
  };
}
