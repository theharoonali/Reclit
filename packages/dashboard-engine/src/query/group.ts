import { bucketOf } from "../bucket";
import { toText } from "../formula/values";
import { type BoundRow, normalizeName } from "../sheet";
import { type Bucket, EMPTY_CATEGORY_LABEL } from "../widget";

/**
 * Splits rows by a column: the x-axis categories, the slices, the pivot's
 * series. `order` is what "category ascending" sorts by — a bucket's start,
 * a number, a date's ms, or the lower-cased text — so months come out
 * chronological and names alphabetical without the label having to sort.
 */

export type Group = {
  /** Unique per group; equals the label. */
  key: string;
  label: string;
  order: number | string;
  rows: BoundRow[];
};

/** Blank categories sort first; numbers before text. */
export function compareOrder(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "number") return -1;
  if (typeof b === "number") return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function partition(
  rows: readonly BoundRow[],
  column: string,
  bucket: Bucket,
): Group[] {
  const key = normalizeName(column);
  const groups = new Map<string, Group>();

  for (const row of rows) {
    const value = row.scope.get(key);
    let label: string;
    let order: number | string;

    if (value === null || value === "") {
      label = EMPTY_CATEGORY_LABEL;
      order = Number.NEGATIVE_INFINITY;
    } else if (bucket !== "none") {
      if (!(value instanceof Date)) continue; // validated: only date columns bucket
      const slot = bucketOf(value, bucket);
      label = slot.label;
      order = slot.start;
    } else if (value instanceof Date) {
      label = value.toISOString().slice(0, 10);
      order = value.getTime();
    } else if (typeof value === "number") {
      label = String(value);
      order = value;
    } else {
      label = toText(value);
      order = label.toLowerCase();
    }

    const group = groups.get(label);
    if (group) group.rows.push(row);
    else groups.set(label, { key: label, label, order, rows: [row] });
  }

  return [...groups.values()];
}
