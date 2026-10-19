"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { storeActiveWorkspaceId } from "@/components/workspace/workspace-provider";
import { ApiError } from "@/lib/api-fetch";
import {
  type CreateWorkspaceFields,
  createWorkspace,
  type OnboardingErrorKey,
  type OnboardingResult,
  onboardingErrorKey,
} from "@/lib/onboarding/api";
import { useTRPC } from "@/trpc/client";

/**
 * `POST /onboarding`: the workspace, its sheet from the file and the chosen
 * columns. The new workspace becomes the active one and `workspace.list` is
 * refetched; the flag stays false, so the gate keeps the user here for the
 * cards step. "Already completed" (another tab finished first) refetches
 * `user.me` so the gate moves on.
 */
export function useOnboardingCreate(
  onCreated: (result: OnboardingResult) => void,
) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      file,
      fields,
    }: {
      file: File;
      fields: CreateWorkspaceFields;
    }) => createWorkspace(file, fields),
    onSuccess: async (result) => {
      storeActiveWorkspaceId(result.workspace.id);
      await queryClient.invalidateQueries({
        queryKey: trpc.workspace.list.queryKey(),
      });
      onCreated(result);
    },
    onError: async (error) => {
      if (
        error instanceof ApiError &&
        error.code === "ONBOARDING_ALREADY_COMPLETED"
      ) {
        await queryClient.invalidateQueries({
          queryKey: trpc.user.me.queryKey(),
        });
      }
    },
  });

  return {
    run: (file: File, fields: CreateWorkspaceFields) =>
      mutation.mutate({ file, fields }),
    isPending: mutation.isPending,
    errorKey: (mutation.isError
      ? onboardingErrorKey(
          mutation.error instanceof ApiError ? mutation.error.code : "UNKNOWN",
        )
      : null) as OnboardingErrorKey | null,
  };
}
