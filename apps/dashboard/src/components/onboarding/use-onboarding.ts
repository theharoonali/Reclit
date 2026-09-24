"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { storeActiveWorkspaceId } from "@/components/workspace/workspace-provider";
import { ApiError } from "@/lib/api-fetch";
import {
  completeOnboarding,
  type OnboardingErrorKey,
  onboardingErrorKey,
} from "@/lib/onboarding/complete-onboarding";
import { useTRPC } from "@/trpc/client";

/**
 * Sends the upload to `POST /onboarding`. On success the new workspace becomes
 * the active one and `user.me` is refetched: its `onboardingCompleted` is now
 * true, so the `(onboarding)` gate itself redirects to the dashboard — this
 * hook never navigates.
 */
export function useOnboarding(): {
  run: (file: File, name: string) => void;
  /** Clears a previous failure, e.g. when another file is picked. */
  reset: () => void;
  isPending: boolean;
  errorKey: OnboardingErrorKey | null;
} {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshUser = () =>
    queryClient.invalidateQueries({ queryKey: trpc.user.me.queryKey() });

  const mutation = useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) =>
      completeOnboarding(file, name),
    onSuccess: async (result) => {
      storeActiveWorkspaceId(result.workspace.id);
      await queryClient.invalidateQueries({
        queryKey: trpc.workspace.list.queryKey(),
      });
      await refreshUser();
    },
    onError: async (error) => {
      // Already onboarded (another tab finished first): let the gate move on.
      if (
        error instanceof ApiError &&
        error.code === "ONBOARDING_ALREADY_COMPLETED"
      ) {
        await refreshUser();
      }
    },
  });

  return {
    run: (file, name) => mutation.mutate({ file, name }),
    reset: mutation.reset,
    // Stays pending through the refetch, so the button does not flicker back
    // before the gate redirects.
    isPending: mutation.isPending || mutation.isSuccess,
    errorKey: mutation.isError
      ? onboardingErrorKey(
          mutation.error instanceof ApiError ? mutation.error.code : "UNKNOWN",
        )
      : null,
  };
}
