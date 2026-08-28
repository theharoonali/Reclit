"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { fetchAllRows } from "@/lib/ai-spreadsheet/fetch-all-rows";
import { useTRPC, useTRPCClient } from "@/trpc/client";
import { AiSpreadsheetGrid } from "./ai-spreadsheet-grid";

/**
 * Fetches the newest spreadsheet and hands it to the grid.
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
 */
export function AiSpreadsheetLoader() {
  const t = useTranslations("aiSpreadsheet");
  const trpc = useTRPC();
  const client = useTRPCClient();

  const sheets = useQuery(trpc.spreadsheet.list.queryOptions());
  const newest = sheets.data?.[0];
  const sheetId = newest?.id ?? "";

  const rows = useQuery({
    queryKey: trpc.spreadsheet.rows.queryKey({ id: sheetId }),
    queryFn: () =>
      fetchAllRows((input) => client.spreadsheet.rows.query(input), sheetId),
    enabled: newest !== undefined,
  });

  if (sheets.isError || rows.isError) {
    return <ErrorState message={t("loadError")} />;
  }
  if (sheets.isPending || (newest !== undefined && rows.isPending)) {
    return <LoadingState label={t("loading")} />;
  }
  if (!newest || !rows.data) {
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
