"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { useTRPC } from "@/trpc/client";
import { AiSpreadsheetGrid } from "./ai-spreadsheet-grid";

/**
 * Fetches the newest spreadsheet's first page and hands it to the grid.
 *
 * Only the first page: `normalize()` paints unfetched rows blank, which is
 * already right, and real paging means merging pages into the model — out of
 * scope (docs/plans/006-spreadsheet-backend.md). react-query's structural
 * sharing keeps the payload referentially stable across re-renders, so the
 * grid's model is not re-normalised unless the data actually changed.
 */
export function AiSpreadsheetLoader() {
  const t = useTranslations("aiSpreadsheet");
  const trpc = useTRPC();

  const sheets = useQuery(trpc.spreadsheet.list.queryOptions());
  const newest = sheets.data?.[0];

  const rows = useQuery({
    ...trpc.spreadsheet.rows.queryOptions({ id: newest?.id ?? "" }),
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
