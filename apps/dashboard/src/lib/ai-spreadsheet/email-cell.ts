import type { CellValue, SheetColumn } from "./types";

// The Mail (email node) cell's value is `{ address: sent email | "FAILED" }`
// (run-ai contract — run-ai.api.test.ts). These helpers are the one place
// the dashboard reads that shape; the canvas chips, the column form's totals
// and the tests all count through here.

/** The tag the API writes for an address whose send failed. */
export const EMAIL_FAILED_VALUE = "FAILED";

export function isEmailNode(
  column: Pick<SheetColumn, "node"> | undefined | null,
): boolean {
  return column?.node === "email";
}

/**
 * How many of the cell's sends went out and how many failed. `null` for
 * anything that is not the Mail object shape (a blank cell, a working run's
 * cell, a legacy text value).
 */
export function emailCellCounts(
  value: CellValue,
): { sent: number; failed: number } | null {
  if (value === null || typeof value !== "object") return null;
  let sent = 0;
  let failed = 0;
  for (const entry of Object.values(value)) {
    if (entry === EMAIL_FAILED_VALUE) failed++;
    else sent++;
  }
  return { sent, failed };
}
