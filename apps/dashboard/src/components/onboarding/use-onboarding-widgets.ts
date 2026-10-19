"use client";

import type { ColumnMeta } from "@reclit/dashboard-engine";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type OnboardingErrorKey,
  trpcCodeOf,
  trpcErrorKey,
} from "@/lib/onboarding/api";
import {
  fromRecommendations,
  newWidgetDraft,
  type WidgetDraft,
} from "@/lib/onboarding/widget-draft";
import { useTRPC } from "@/trpc/client";

/**
 * The cards step for a created workspace: the sheet's columns (one
 * `spreadsheet.rows` page, for the names the editors offer and the engine
 * validates against), `assistant.recommendWidgets` asked once per workspace
 * as soon as it is known, and the draft cards the user edits. The AI columns
 * are empty at this point, so there are no previews — configs only.
 */
export function useOnboardingWidgets(
  workspaceId: string,
  spreadsheetId: string,
) {
  const trpc = useTRPC();
  const [drafts, setDrafts] = useState<WidgetDraft[]>([]);
  const seed = useRef(0);
  const counter = useRef(0);

  const rows = useQuery(
    trpc.spreadsheet.rows.queryOptions(
      { id: spreadsheetId, startRow: 0, limit: 1 },
      { enabled: spreadsheetId !== "" },
    ),
  );
  const sheetColumns = rows.data?.columns;
  const columns = useMemo<ColumnMeta[]>(
    () => (sheetColumns ?? []).map(({ name, type }) => ({ name, type })),
    [sheetColumns],
  );
  const aiColumnCount = (sheetColumns ?? []).filter(
    (column) => column.node !== null && column.prompt !== null,
  ).length;

  const recommend = useMutation(
    trpc.assistant.recommendWidgets.mutationOptions({
      onSuccess: (result) => {
        seed.current += 1;
        setDrafts(fromRecommendations(result.recommendations, seed.current));
      },
    }),
  );

  // One ask per workspace, the moment it is known — on create and on resume.
  const { mutate: runRecommend } = recommend;
  const askedFor = useRef<string | null>(null);
  useEffect(() => {
    if (workspaceId === "" || askedFor.current === workspaceId) return;
    askedFor.current = workspaceId;
    runRecommend({ workspaceId });
  }, [runRecommend, workspaceId]);

  const update = useCallback(
    (key: string, next: WidgetDraft) =>
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
  const add = useCallback(
    (name: string) => {
      counter.current += 1;
      setDrafts((current) => [
        ...current,
        newWidgetDraft(columns, `new-${counter.current}`, name),
      ]);
    },
    [columns],
  );

  return {
    drafts,
    columns,
    aiColumnCount,
    isLoadingColumns: spreadsheetId !== "" && rows.isPending,
    isRecommending: recommend.isPending,
    errorKey: (recommend.isError
      ? trpcErrorKey(trpcCodeOf(recommend.error))
      : rows.isError
        ? "error"
        : null) as OnboardingErrorKey | null,
    update,
    remove,
    add,
  };
}

export type OnboardingWidgetsApi = ReturnType<typeof useOnboardingWidgets>;
