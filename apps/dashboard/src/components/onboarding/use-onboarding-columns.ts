"use client";

import type { RouterInputs } from "@reclit/api/trpc/routers/_app";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  type OnboardingErrorKey,
  trpcCodeOf,
  trpcErrorKey,
} from "@/lib/onboarding/api";
import {
  type ColumnDraftItem,
  fromSuggestions,
  newAiColumn,
  newPlainColumn,
} from "@/lib/onboarding/column-draft";
import { useTRPC } from "@/trpc/client";

export type SuggestColumnsInput = RouterInputs["onboarding"]["suggestColumns"];

/**
 * The columns step: `onboarding.suggestColumns` and the draft list it fills.
 * A new suggestion replaces the AI's earlier proposals and keeps the user's
 * own columns; the model's "tell me more" question rides along.
 */
export function useOnboardingColumns() {
  const trpc = useTRPC();
  const [drafts, setDrafts] = useState<ColumnDraftItem[]>([]);
  const [needsMoreContext, setNeedsMoreContext] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const seed = useRef(0);
  const counter = useRef(0);

  const suggest = useMutation(
    trpc.onboarding.suggestColumns.mutationOptions({
      onSuccess: (result) => {
        seed.current += 1;
        setDrafts((current) => [
          ...fromSuggestions(result.columns, seed.current),
          ...current.filter((draft) => draft.source === "user"),
        ]);
        setNeedsMoreContext(result.needsMoreContext);
        setQuestion(result.question);
      },
    }),
  );

  const update = useCallback(
    (key: string, next: ColumnDraftItem) =>
      setDrafts((current) =>
        current.map((draft) => (draft.key === key ? next : draft)),
      ),
    [],
  );
  const remove = useCallback(
    (key: string) =>
      setDrafts((current) => current.filter((draft) => draft.key !== key)),
    [],
  );
  const nextKey = () => {
    counter.current += 1;
    return `user-${counter.current}`;
  };
  const addAi = useCallback(
    () => setDrafts((current) => [...current, newAiColumn(nextKey())]),
    [],
  );
  const addPlain = useCallback(
    () => setDrafts((current) => [...current, newPlainColumn(nextKey())]),
    [],
  );

  const { mutate } = suggest;
  const run = useCallback(
    (input: SuggestColumnsInput) => mutate(input),
    [mutate],
  );

  return {
    drafts,
    update,
    remove,
    addAi,
    addPlain,
    needsMoreContext,
    question,
    run,
    isPending: suggest.isPending,
    errorKey: (suggest.isError
      ? trpcErrorKey(trpcCodeOf(suggest.error))
      : null) as OnboardingErrorKey | null,
  };
}

export type OnboardingColumnsApi = ReturnType<typeof useOnboardingColumns>;
