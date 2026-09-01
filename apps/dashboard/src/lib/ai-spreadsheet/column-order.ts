import type { SheetColumn } from "./types";

/**
 * The column order a drag would produce, for painting only.
 *
 * This is *not* the frontend recomputing what the backend owns: nothing here
 * touches the model or `sortOrder`. It is the preview the grid shows while a
 * column is in flight, so the user can see where it lands without an insertion
 * line. On drop the API is sent one column and one position, and the order it
 * returns is what the model actually adopts (`use-column-reorder.ts`).
 *
 * `from` and `to` are display positions. Out-of-range input returns the array
 * unchanged rather than throwing — a paint is not the place to fail.
 */
export function previewOrder(
  columns: SheetColumn[],
  from: number,
  to: number,
): SheetColumn[] {
  if (from === to) return columns;
  if (from < 0 || from >= columns.length) return columns;
  if (to < 0 || to >= columns.length) return columns;
  const next = [...columns];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return columns;
  next.splice(to, 0, moved);
  return next;
}

/** Where a drop into gap `slot` puts a column currently at `from`. */
export const dropTarget = (from: number, slot: number) =>
  slot > from ? slot - 1 : slot;
