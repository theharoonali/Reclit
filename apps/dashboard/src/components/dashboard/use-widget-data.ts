"use client";

import { runWidget } from "@reclit/dashboard-engine";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { SheetPayload } from "@/lib/ai-spreadsheet/types";
import { sheetRowsQueryKey } from "@/lib/dashboard/sheet-rows-query";
import {
  type DashboardWidget,
  toWidgetState,
  type WidgetState,
} from "@/lib/dashboard/widget-state";
import { fetchAllRows } from "@/lib/spreadsheet/fetch-all-rows";
import { useTRPCClient } from "@/trpc/client";

/**
 * A widget's data, computed in the browser from its sheet.
 *
 * Every widget of a sheet observes the same query (`sheetRowsQueryKey`), so
 * the sheet is fetched once per dashboard and shared; `select` derives this
 * widget's figures from the payload, and TanStack memoises that per observer
 * — the "frontend store" of computed data. Nothing is written back to the
 * API. `staleTime: 0` + focus refetch is the freshness rule: every visit and
 * every return to the tab re-reads the sheet.
 *
 * `runWidget` never throws — a query that no longer fits the sheet (a renamed
 * column) comes back as an issue, not as a query error, so there is no
 * `retry` storm and the card can say what is wrong.
 */
export function useWidgetData(widget: DashboardWidget): WidgetState {
  const client = useTRPCClient();
  const sheetId = widget.spreadsheetId;
  const select = useCallback(
    (payload: SheetPayload) => runWidget(widget, payload),
    [widget],
  );

  const query = useQuery({
    queryKey: sheetRowsQueryKey(sheetId),
    queryFn: () =>
      fetchAllRows((input) => client.spreadsheet.rows.query(input), sheetId),
    select,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  return toWidgetState(query);
}
