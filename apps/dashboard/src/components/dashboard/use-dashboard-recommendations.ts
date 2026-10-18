"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import type { AssistantRecommendation } from "@/lib/dashboard/widget-state";
import { useTRPC } from "@/trpc/client";

/** A proposed card with a local key for the list. */
export type RecommendedCard = AssistantRecommendation & { key: string };

export type RecommendationSet = {
  /** The sheet every card computes from. */
  spreadsheetId: string;
  /** The cards still waiting for an answer. */
  cards: RecommendedCard[];
};

/**
 * The recommendation flow for one workspace: ask the assistant
 * (`assistant.recommendWidgets`), hold the proposed cards, add one or all
 * through `dashboard.createWidget` — without `row` / `sort`, so the api
 * places each in the first row with room — and dismiss. The set is
 * component state: a proposal, gone on reload. Adds run one at a time: two
 * creates in flight would both be placed against the same slots.
 */
export function useDashboardRecommendations(workspaceId: string) {
  const t = useTranslations("dashboard.recommendations");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [set, setSet] = useState<RecommendationSet | null>(null);
  const [adding, setAdding] = useState<ReadonlySet<string>>(new Set());
  const [isAddingAll, setAddingAll] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const recommend = useMutation(
    trpc.assistant.recommendWidgets.mutationOptions({
      onSuccess: (result) => {
        setAddError(null);
        setSet({
          spreadsheetId: result.spreadsheetId,
          cards: result.recommendations.map((card, index) => ({
            ...card,
            key: `card-${index}`,
          })),
        });
      },
    }),
  );
  const create = useMutation(trpc.dashboard.createWidget.mutationOptions());

  const { mutate: runRecommend, reset: resetRecommend } = recommend;
  const run = useCallback(() => {
    if (workspaceId !== "") runRecommend({ workspaceId });
  }, [runRecommend, workspaceId]);
  const dismissError = useCallback(() => resetRecommend(), [resetRecommend]);

  const errorMessage = ((): string | null => {
    if (!recommend.isError) return null;
    const code =
      recommend.error instanceof TRPCClientError
        ? recommend.error.data?.code
        : undefined;
    return t(code === "SERVICE_UNAVAILABLE" ? "unavailable" : "error");
  })();

  const { mutateAsync: createWidget } = create;
  const add = useCallback(
    async (key: string): Promise<boolean> => {
      const card = set?.cards.find((item) => item.key === key);
      if (!card) return false;
      setAdding((current) => new Set(current).add(key));
      try {
        const { key: _key, ...input } = card;
        await createWidget({ workspaceId, ...input });
        setAddError(null);
        setSet((current) => {
          if (!current) return null;
          const cards = current.cards.filter((item) => item.key !== key);
          return cards.length === 0 ? null : { ...current, cards };
        });
        await queryClient.invalidateQueries({
          queryKey: trpc.dashboard.byWorkspace.queryKey({ workspaceId }),
        });
        return true;
      } catch {
        setAddError(t("addError"));
        return false;
      } finally {
        setAdding((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [createWidget, queryClient, set, t, trpc, workspaceId],
  );

  const addAll = useCallback(async () => {
    if (!set) return;
    setAddingAll(true);
    try {
      for (const card of [...set.cards]) {
        if (!(await add(card.key))) break;
      }
    } finally {
      setAddingAll(false);
    }
  }, [add, set]);

  const dismiss = useCallback(() => {
    setSet(null);
    setAddError(null);
  }, []);

  return {
    set,
    isRecommending: recommend.isPending,
    errorMessage,
    run,
    dismissError,
    add,
    addAll,
    isAdding: (key: string) => adding.has(key),
    isAddingAll,
    addError,
    dismiss,
  };
}

export type DashboardRecommendationsApi = ReturnType<
  typeof useDashboardRecommendations
>;
