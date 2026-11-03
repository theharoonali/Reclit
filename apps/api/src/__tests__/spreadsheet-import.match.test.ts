import { describe, expect, it } from "bun:test";
import { tablesFromXml } from "../modules/spreadsheet/spreadsheet-import.docx";
import {
  matchColumns,
  nameTokens,
  similarity,
  unionTables,
} from "../modules/spreadsheet/spreadsheet-import.match";

// The pure halves of import merging: column-name matching, multi-table union,
// and reading tables out of WordprocessingML. No database, no server — the
// contract for the endpoints that use them is in spreadsheet.api.test.ts.

describe("similarity", () => {
  it("treats case, punctuation, spacing and plurals as the same name", () => {
    expect(nameTokens("Phone Numbers.")).toEqual(["phone", "number"]);
    expect(similarity("E-mail", "email")).toBe(1);
    expect(similarity("first_name", "First Name")).toBe(1);
    expect(similarity("Addresses", "address")).toBe(1);
  });

  it("matches synonyms and near spellings", () => {
    expect(similarity("Mobile No", "Phone")).toBeGreaterThanOrEqual(0.85);
    expect(similarity("Full Name", "Name")).toBeGreaterThanOrEqual(0.85);
    expect(similarity("Organisation", "Company")).toBeGreaterThanOrEqual(0.85);
    expect(similarity("Adress", "Address")).toBeGreaterThanOrEqual(0.85);
  });

  it("keeps different columns apart", () => {
    expect(similarity("First Name", "Last Name")).toBeLessThan(0.85);
    expect(similarity("Address 1", "Address 2")).toBe(0);
    expect(similarity("Customer Name", "Name")).toBeLessThan(0.85);
    expect(similarity("Start Date", "End Date")).toBeLessThan(0.85);
    expect(similarity("", "Name")).toBe(0);
  });
});

describe("matchColumns", () => {
  it("is one-to-one, and an exact match beats a synonym", () => {
    expect(
      matchColumns(["Mobile", "Phone", "City"], ["Phone", "Town"]),
    ).toEqual([null, 0, null]);
  });

  it("returns null for everything when there are no targets", () => {
    expect(matchColumns(["A", "B"], [])).toEqual([null, null]);
  });
});

describe("unionTables", () => {
  it("unions headers by similarity and keeps rows in document order", () => {
    expect(
      unionTables([
        [
          ["Name", "Email", ""],
          ["Ada", "ada@x.test", "ignored past the header"],
        ],
        [
          ["Phone", "full name"],
          ["555", "Grace"],
          ["PHONE", "Full-Name"], // repeated header, dropped
          ["556", "Alan"],
        ],
      ]),
    ).toEqual([
      ["Name", "Email", "Phone"],
      ["Ada", "ada@x.test", ""],
      ["Grace", "", "555"],
      ["Alan", "", "556"],
    ]);
  });

  it("continues the same rows when a table only adds new columns", () => {
    // Per person: a "Name, Age" table, then a "Phone, City" table.
    expect(
      unionTables([
        [
          ["Name", "Age"],
          ["Ada", "36"],
        ],
        [
          ["Phone", "City"],
          ["555", "London"],
        ],
        [
          ["Name", "Age"],
          ["Alan", "41"],
        ],
        [
          ["Phone", "City"],
          ["556", "Wilmslow"],
        ],
      ]),
    ).toEqual([
      ["Name", "Age", "Phone", "City"],
      ["Ada", "36", "555", "London"],
      ["Alan", "41", "556", "Wilmslow"],
    ]);
  });

  it("stacks a table with new columns but a different row count", () => {
    expect(
      unionTables([
        [["Name"], ["Ada"], ["Alan"]],
        [["Product"], ["Lamp"]],
      ]),
    ).toEqual([
      ["Name", "Product"],
      ["Ada", ""],
      ["Alan", ""],
      ["", "Lamp"],
    ]);
  });

  it("names a blank header cell inside the header's width", () => {
    expect(
      unionTables([
        [
          ["A", "", "C"],
          ["1", "2", "3"],
        ],
      ]),
    ).toEqual([
      ["A", "Column 2", "C"],
      ["1", "2", "3"],
    ]);
  });
});

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const cell = (text: string, props = "") =>
  `<w:tc><w:tcPr>${props}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
const doc = (body: string) =>
  `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`;

describe("tablesFromXml", () => {
  it("reads every table, ignoring prose, and decodes entities", () => {
    const xml = doc(
      `<w:p><w:r><w:t>Intro</w:t></w:r></w:p>` +
        `<w:tbl><w:tr>${cell("A &amp; B")}${cell("C")}</w:tr></w:tbl>` +
        `<w:tbl><w:tr>${cell("D")}</w:tr></w:tbl>`,
    );
    expect(tablesFromXml(xml)).toEqual([[["A & B", "C"]], [["D"]]]);
  });

  it("repeats a horizontally merged cell and copies a vertical continuation", () => {
    const xml = doc(
      "<w:tbl>" +
        `<w:tr>${cell("Region", '<w:gridSpan w:val="2"/>')}${cell("Total")}</w:tr>` +
        `<w:tr>${cell("North", '<w:vMerge w:val="restart"/>')}${cell("a")}${cell("1")}</w:tr>` +
        `<w:tr>${cell("", "<w:vMerge/>")}${cell("b")}${cell("2")}</w:tr>` +
        "</w:tbl>",
    );
    expect(tablesFromXml(xml)).toEqual([
      [
        ["Region", "Region", "Total"],
        ["North", "a", "1"],
        ["North", "b", "2"],
      ],
    ]);
  });

  it("joins a cell's paragraphs and flattens a nested table into its cell", () => {
    const xml = doc(
      "<w:tbl><w:tr><w:tc>" +
        "<w:p><w:r><w:t>line one</w:t></w:r></w:p>" +
        "<w:p><w:r><w:t>line two</w:t></w:r></w:p>" +
        `<w:tbl><w:tr>${cell("inner")}</w:tr></w:tbl>` +
        "</w:tc></w:tr></w:tbl>",
    );
    expect(tablesFromXml(xml)).toEqual([[["line one\nline two\ninner"]]]);
  });
});
