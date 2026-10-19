"use client";

import { useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-fetch";
import {
  describeSheet,
  type OnboardingDescription,
  type OnboardingErrorKey,
  onboardingErrorKey,
} from "@/lib/onboarding/api";

/**
 * `POST /onboarding/describe`, run as soon as a file is picked: the typed
 * upload and the AI's description. The wizard fills its fields from the
 * result; nothing is written server-side.
 */
export function useOnboardingDescribe(
  onDescribed: (result: OnboardingDescription) => void,
) {
  const mutation = useMutation({
    mutationFn: describeSheet,
    onSuccess: onDescribed,
  });
  return {
    run: (file: File) => mutation.mutate(file),
    reset: mutation.reset,
    isPending: mutation.isPending,
    data: mutation.data ?? null,
    errorKey: (mutation.isError
      ? onboardingErrorKey(
          mutation.error instanceof ApiError ? mutation.error.code : "UNKNOWN",
        )
      : null) as OnboardingErrorKey | null,
  };
}
