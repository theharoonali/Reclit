/**
 * The dashboard's cache key for a sheet's rows — spelled once, here.
 *
 * Deliberately NOT `trpc.spreadsheet.rows.queryKey(...)`: the sheet page
 * registers its merged payload under that key with `gcTime: 0` and relies on
 * the entry dying with the grid (grid edits never write back to the cache).
 * TanStack keeps the longest `gcTime` any observer asked for, so sharing the
 * key from here would make that payload outlive the grid and resurface stale
 * on the next visit. Under its own key the dashboard can keep normal caching.
 */
export const SHEET_ROWS_QUERY_PREFIX = ["dashboard", "sheet-rows"] as const;

export const sheetRowsQueryKey = (sheetId: string) =>
  [...SHEET_ROWS_QUERY_PREFIX, sheetId] as const;
