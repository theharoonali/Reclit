import type { RowScope, SheetPayloadLike, Value } from "../../src/index";
import { normalizeName } from "../../src/index";

/** A `RowScope` over a plain object, keyed like the engine (normalised names). */
export function scope(cells: Record<string, Value>): RowScope {
  const map = new Map(
    Object.entries(cells).map(([name, value]) => [normalizeName(name), value]),
  );
  return { get: (key) => map.get(key) ?? null };
}

export const COLUMNS = [
  { name: "Region", type: "string" },
  { name: "Revenue", type: "number" },
  { name: "Cost", type: "number" },
  { name: "Signed", type: "date" },
  { name: "Paid", type: "boolean" },
  { name: "Seller", type: "string" },
] as const;

type Cells = Partial<Record<(typeof COLUMNS)[number]["name"], unknown>>;

/** Builds a sparse `spreadsheet.rows`-shaped payload: a null cell is absent. */
export function payload(rows: Cells[]): SheetPayloadLike {
  return {
    columns: COLUMNS.map(({ name, type }) => ({ name, type })),
    rows: rows.map((cells, index) => ({
      id: `row.${index}`,
      index,
      columns: Object.entries(cells)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([name, value]) => ({ name, value })),
    })),
  };
}

/** Five rows: two regions, a blank region, a blank revenue, a blank date. */
export const SHEET = payload([
  {
    Region: "North",
    Revenue: 100,
    Cost: 60,
    Signed: "2026-01-15T00:00:00.000Z",
    Paid: true,
    Seller: "Ann",
  },
  {
    Region: "North",
    Revenue: 200,
    Cost: 120,
    Signed: "2026-02-10T00:00:00.000Z",
    Paid: false,
    Seller: "Bob",
  },
  {
    Region: "South",
    Revenue: 50,
    Cost: 20,
    Signed: "2026-02-20T00:00:00.000Z",
    Paid: true,
    Seller: "Ann",
  },
  {
    Region: "South",
    Cost: 10,
    Signed: "2026-03-05T00:00:00.000Z",
    Paid: true,
    Seller: "Cara",
  },
  { Revenue: 30, Cost: 5, Paid: false, Seller: "Bob" },
]);
