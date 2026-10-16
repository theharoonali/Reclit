import { describe, expect, it } from "bun:test";
import { applyFilters, bindSheet, type WidgetFilter } from "../src/index";
import { SHEET } from "./support/sheet";

const rows = bindSheet(SHEET).rows;
const ids = (...filters: WidgetFilter[]) =>
  applyFilters(rows, filters).map((row) => row.id);

describe("applyFilters", () => {
  it("returns every row without filters", () => {
    expect(ids()).toHaveLength(5);
  });

  it("eq and neq match exactly and skip blanks", () => {
    expect(ids({ column: "Region", op: "eq", value: "North" })).toEqual([
      "row.0",
      "row.1",
    ]);
    expect(ids({ column: "Region", op: "neq", value: "North" })).toEqual([
      "row.2",
      "row.3",
    ]);
  });

  it("orders numbers", () => {
    expect(ids({ column: "Revenue", op: "gt", value: 60 })).toEqual([
      "row.0",
      "row.1",
    ]);
    expect(ids({ column: "Revenue", op: "gte", value: 50 })).toEqual([
      "row.0",
      "row.1",
      "row.2",
    ]);
    expect(ids({ column: "Cost", op: "lt", value: 20 })).toEqual([
      "row.3",
      "row.4",
    ]);
    expect(ids({ column: "Cost", op: "lte", value: 20 })).toEqual([
      "row.2",
      "row.3",
      "row.4",
    ]);
  });

  it("orders dates against ISO strings", () => {
    expect(ids({ column: "Signed", op: "gte", value: "2026-02-01" })).toEqual([
      "row.1",
      "row.2",
      "row.3",
    ]);
    expect(ids({ column: "Signed", op: "lt", value: "2026-02-01" })).toEqual([
      "row.0",
    ]);
  });

  it("contains is a case-insensitive substring", () => {
    expect(ids({ column: "Seller", op: "contains", value: "an" })).toEqual([
      "row.0",
      "row.2",
    ]);
    expect(ids({ column: "Seller", op: "contains", value: "AR" })).toEqual([
      "row.3",
    ]);
  });

  it("in matches any of the values", () => {
    expect(ids({ column: "Seller", op: "in", value: ["Ann", "Cara"] })).toEqual(
      ["row.0", "row.2", "row.3"],
    );
    expect(ids({ column: "Seller", op: "in", value: "Ann" })).toEqual([]);
  });

  it("isEmpty and notEmpty test blanks", () => {
    expect(ids({ column: "Region", op: "isEmpty" })).toEqual(["row.4"]);
    expect(ids({ column: "Signed", op: "notEmpty" })).toHaveLength(4);
  });

  it("matches booleans and column names case-insensitively", () => {
    expect(ids({ column: "paid", op: "eq", value: true })).toEqual([
      "row.0",
      "row.2",
      "row.3",
    ]);
  });

  it("ands several filters together", () => {
    expect(
      ids(
        { column: "Region", op: "eq", value: "North" },
        { column: "Paid", op: "eq", value: false },
      ),
    ).toEqual(["row.1"]);
  });
});
