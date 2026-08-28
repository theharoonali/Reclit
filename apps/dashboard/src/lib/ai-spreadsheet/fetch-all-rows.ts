import { parseShortRowId } from "./short-ids";
import type { SheetPayload } from "./types";

/**
 * Reads every *stored* row of a sheet, not just the first page.
 *
 * `spreadsheet.rows` pages at the API's `limit` cap, so a sheet with more rows
 * than one page — anything imported from a real file — would otherwise paint
 * only its first page and leave the rest blank. Rows are sparse, so "every
 * stored row" is bounded by what was actually written (the import cap), not by
 * the sheet's 5,000,000-row virtual height.
 *
 * The pages are merged into one payload before the grid ever sees it, so the
 * model is normalised once instead of once per page.
 */

/** The API's `limit` maximum (`paginationInput` in the spreadsheet schema). */
const PAGE_SIZE = 500;

/** Belt and braces: stops a non-advancing cursor from looping forever. */
const MAX_PAGES = 200;

type RowsQuery = (input: {
  id: string;
  startRow: number;
  limit: number;
}) => Promise<SheetPayload>;

export async function fetchAllRows(
  query: RowsQuery,
  id: string,
): Promise<SheetPayload> {
  const first = await query({ id, startRow: 0, limit: PAGE_SIZE });
  if (!first.pagination.hasMore) return first;

  const rows = [...first.rows];
  let pagination = first.pagination;

  for (let page = 1; pagination.hasMore && page < MAX_PAGES; page += 1) {
    const startRow =
      pagination.nextCursor === null
        ? null
        : parseShortRowId(pagination.nextCursor);
    if (startRow === null) break;
    const next = await query({ id, startRow, limit: PAGE_SIZE });
    if (next.rows.length === 0) break;
    rows.push(...next.rows);
    pagination = next.pagination;
  }

  return {
    ...first,
    rows,
    // Everything stored is now in `rows`, so the envelope says so.
    pagination: { ...first.pagination, hasMore: false, nextCursor: null },
  };
}
