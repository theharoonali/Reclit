"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { fetchAllRows } from "@/lib/ai-spreadsheet/fetch-all-rows";
import { useTRPC, useTRPCClient } from "@/trpc/client";
import { AiSpreadsheetGrid } from "./ai-spreadsheet-grid";

/**
 * Fetches the active workspace's spreadsheet and hands it to the grid.
 * Switching workspaces swaps `sheetId`, which refetches — the URL never
 * changes (docs/plans/013-workspaces.md).
 *
 * `spreadsheet.rows` is paged, so this walks every page and merges them before
 * the grid sees anything — a sheet imported from a real file has far more rows
 * than one page, and painting only the first page would silently drop the rest.
 * Rows are sparse, so this reads what was actually written, not the sheet's
 * 5,000,000-row virtual height.
 *
 * The query is registered under tRPC's own key for `spreadsheet.rows`, so
 * `use-sheet-import.ts` invalidating that key still refreshes this. react-query's
 * structural sharing keeps the payload referentially stable across re-renders,
 * so the grid's model is not re-normalised unless the data actually changed.
 *
 * **The cache entry lives exactly as long as the page.** Grid edits never
 * write back to this query (the local-model deviation, `use-sheet-sync.ts`),
 * so a payload that outlived the grid would be a pre-edit snapshot: come back
 * within the default two-minute `staleTime` and a reordered column is back
 * where it started, a renamed one has its old name, until a full reload.
 * `gcTime: 0` drops the entry when the grid unmounts, so every visit fetches
 * the server's truth. While mounted nothing may refetch behind the grid's back
 * — a new payload re-normalises the model under a debounced cell write — hence
 * `staleTime: Infinity` and no focus/reconnect refetch. An import's explicit
 * `invalidateQueries` still refetches: invalidation ignores `staleTime`.
 */
export function AiSpreadsheetLoader() {
  const t = useTranslations("aiSpreadsheet");
  const trpc = useTRPC();
  const client = useTRPCClient();

  const workspace = useWorkspace();
  const sheetId = workspace.activeWorkspace?.spreadsheetId ?? "";

  const rows = useQuery({
    queryKey: trpc.spreadsheet.rows.queryKey({ id: sheetId }),
    queryFn: () =>
      fetchAllRows((input) => client.spreadsheet.rows.query(input), sheetId),
    enabled: sheetId !== "",
    gcTime: 0,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (workspace.isError || rows.isError) {
    return <ErrorState message={t("loadError")} />;
  }
  if (workspace.isPending || (sheetId !== "" && rows.isPending)) {
    return <LoadingState label={t("loading")} />;
  }
  if (sheetId === "" || !rows.data) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8">
        <p className="text-subtitle">{t("empty.title")}</p>
        <p className="text-center text-body text-muted-foreground">
          {t("empty.description")}
        </p>
      </div>
    );
  }

  return <AiSpreadsheetGrid payload={rows.data} />;
}
