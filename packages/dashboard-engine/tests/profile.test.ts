import { describe, expect, it } from "bun:test";
import { profileColumns, type SheetPayloadLike } from "../src/index";
import { payload, SHEET } from "./support/sheet";

/** A payload over arbitrary columns; a null cell is absent, like the API's. */
function sheet(
  columns: { name: string; type: string }[],
  rows: Record<string, unknown>[],
): SheetPayloadLike {
  return {
    columns,
    rows: rows.map((cells, index) => ({
      id: `row.${index}`,
      index,
      columns: Object.entries(cells)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([name, value]) => ({ name, value })),
    })),
  };
}

const byName = (payloadLike: SheetPayloadLike) =>
  Object.fromEntries(
    profileColumns(payloadLike).map((profile) => [profile.name, profile]),
  );

describe("profileColumns", () => {
  it("counts fill, cardinality, ranges and the top values", () => {
    const profile = byName(SHEET);
    expect(profile.Region).toMatchObject({
      type: "string",
      role: "category",
      rows: 5,
      filled: 4,
      blank: 1,
      distinct: 2,
      topValues: [
        { value: "North", count: 2 },
        { value: "South", count: 2 },
      ],
    });
    expect(profile.Revenue).toMatchObject({
      role: "measure",
      filled: 4,
      numbers: { min: 30, max: 200, sum: 380, average: 95, integers: true },
    });
    expect(profile.Signed).toMatchObject({
      role: "time",
      filled: 4,
      dates: {
        min: "2026-01-15T00:00:00.000Z",
        max: "2026-03-05T00:00:00.000Z",
      },
    });
    expect(profile.Paid?.role).toBe("flag");
    expect(profile.Signed?.numbers).toBeUndefined();
  });

  it("caps the top values and treats an empty string as blank", () => {
    const [column] = profileColumns(
      payload([
        { Seller: "a" },
        { Seller: "b" },
        { Seller: "c" },
        { Seller: "" },
        { Seller: "a" },
      ]),
      { topValues: 2 },
    ).filter((profile) => profile.name === "Seller");
    expect(column).toMatchObject({
      filled: 4,
      blank: 1,
      distinct: 3,
      topValues: [
        { value: "a", count: 2 },
        { value: "b", count: 1 },
      ],
    });
  });

  it("reads a year by its range or its name, never as a measure", () => {
    const profile = byName(
      sheet(
        [
          { name: "Year", type: "number" },
          { name: "Period", type: "number" },
          { name: "Amount", type: "number" },
        ],
        [
          { Year: 1, Period: 2021, Amount: 1999.5 },
          { Year: 2, Period: 2022, Amount: 2001 },
          { Year: 3, Period: 2023, Amount: 2050 },
        ],
      ),
    );
    expect(profile.Year?.role).toBe("year");
    expect(profile.Period?.role).toBe("year");
    expect(profile.Amount?.role).toBe("measure");
  });

  it("reads an identifier by its name, a token shape or a dense distinct sequence", () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      "Order ID": index + 1,
      Seq: 5000 + index,
      Customer: `Customer ${index}`,
      Token: `7f3e1a2b-0000-4000-8000-${String(index).padStart(12, "0")}`,
      Revenue: 3 + index * 97,
    }));
    const profile = byName(
      sheet(
        [
          { name: "Order ID", type: "number" },
          { name: "Seq", type: "number" },
          { name: "Customer", type: "string" },
          { name: "Token", type: "string" },
          { name: "Revenue", type: "number" },
        ],
        rows,
      ),
    );
    expect(profile["Order ID"]?.role).toBe("identifier");
    expect(profile.Seq?.role).toBe("identifier");
    expect(profile.Token?.role).toBe("identifier");
    expect(profile.Customer?.role).toBe("text");
    expect(profile.Revenue?.role).toBe("measure");
  });

  it("tells a category from free text by how often values repeat", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      Status: ["open", "closed", "paused"][index % 3],
      Note: `note ${index}`,
      Rating: (index % 5) + 1,
      Name: index < 15 ? "Ann" : `Person ${index}`,
    }));
    const profile = byName(
      sheet(
        [
          { name: "Status", type: "string" },
          { name: "Note", type: "string" },
          { name: "Rating", type: "number" },
          { name: "Name", type: "string" },
        ],
        rows,
      ),
    );
    expect(profile.Status?.role).toBe("category");
    expect(profile.Note?.role).toBe("text");
    expect(profile.Rating?.role).toBe("category");
    expect(profile.Name?.role).toBe("text");
  });

  it("falls back to the type's role when a column holds nothing", () => {
    const profile = byName(
      sheet(
        [
          { name: "Amount", type: "number" },
          { name: "Label", type: "string" },
          { name: "Blob", type: "json" },
        ],
        [{}, {}],
      ),
    );
    expect(profile.Amount).toMatchObject({
      role: "measure",
      filled: 0,
      blank: 2,
      distinct: 0,
      topValues: [],
    });
    expect(profile.Amount?.numbers).toBeUndefined();
    expect(profile.Label?.role).toBe("text");
    expect(profile.Blob?.role).toBe("other");
  });
});
