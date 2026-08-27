import { describe, expect, test } from "bun:test";
import {
  createFormatters,
  editableText,
  fileLabel,
  formatCellText,
  isMistyped,
  isResourceUrl,
  parseCellInput,
  toColumnType,
} from "@/lib/ai-spreadsheet/cell-format";
import type { SheetLabels } from "@/lib/ai-spreadsheet/types";

const LABELS = {
  boolTrue: "True",
  boolFalse: "False",
  jsonCapsule: (count: number) => `${count} keys`,
  jsonEmpty: "empty",
  typeNames: {} as SheetLabels["typeNames"],
} satisfies SheetLabels;

const FORMATTERS = createFormatters("en-US");

describe("toColumnType", () => {
  test("keeps a known type", () => {
    expect(toColumnType("file")).toBe("file");
    expect(toColumnType("boolean")).toBe("boolean");
  });

  test("degrades an unknown type to string rather than throwing", () => {
    expect(toColumnType("timestamptz")).toBe("string");
  });
});

describe("fileLabel", () => {
  test("uses the last path segment", () => {
    expect(fileLabel("https://example.com/files/resume.pdf")).toBe(
      "resume.pdf",
    );
  });

  test("ignores the query and hash", () => {
    expect(fileLabel("https://example.com/a/b.pdf?v=2#page=3")).toBe("b.pdf");
  });

  test("decodes percent escapes", () => {
    expect(fileLabel("https://example.com/my%20resume.pdf")).toBe(
      "my resume.pdf",
    );
  });

  test("falls back to the whole url when there is no usable segment", () => {
    expect(fileLabel("https://")).toBe("https://");
  });
});

describe("isResourceUrl", () => {
  test("accepts an http(s) url", () => {
    expect(isResourceUrl("https://example.com/a.pdf")).toBe(true);
  });

  test("rejects a non-url string, an object and null", () => {
    expect(isResourceUrl("resume.pdf")).toBe(false);
    expect(isResourceUrl({ url: "https://example.com/a.pdf" })).toBe(false);
    expect(isResourceUrl(null)).toBe(false);
  });
});

describe("isMistyped", () => {
  test("null is never mistyped — it is a blank cell", () => {
    expect(isMistyped(null, "number")).toBe(false);
    expect(isMistyped(null, "file")).toBe(false);
  });

  test("file wants a url", () => {
    expect(isMistyped("https://example.com/a.pdf", "file")).toBe(false);
    expect(isMistyped("a.pdf", "file")).toBe(true);
    expect(isMistyped(12, "file")).toBe(true);
  });

  test("audio wants a url, like file", () => {
    expect(isMistyped("https://example.com/a.mp3", "audio")).toBe(false);
    expect(isMistyped("a.mp3", "audio")).toBe(true);
  });

  test("boolean wants a boolean", () => {
    expect(isMistyped(false, "boolean")).toBe(false);
    expect(isMistyped("true", "boolean")).toBe(true);
  });

  test("date wants a parseable string", () => {
    expect(isMistyped("2026-08-27T10:00:00.000Z", "date")).toBe(false);
    expect(isMistyped("not a date", "date")).toBe(true);
  });
});

describe("formatCellText", () => {
  test("a valid capsule value paints no text", () => {
    expect(
      formatCellText("https://example.com/a.pdf", "file", LABELS, FORMATTERS),
    ).toBe("");
    expect(formatCellText({ a: 1 }, "json", LABELS, FORMATTERS)).toBe("");
  });

  test("a mistyped file falls back to its raw text", () => {
    expect(formatCellText("a.pdf", "file", LABELS, FORMATTERS)).toBe("a.pdf");
  });

  test("booleans use the supplied labels", () => {
    expect(formatCellText(true, "boolean", LABELS, FORMATTERS)).toBe("True");
    expect(formatCellText(false, "boolean", LABELS, FORMATTERS)).toBe("False");
  });

  test("dates format in UTC, not the viewer's zone", () => {
    expect(
      formatCellText("2026-08-27T23:30:00.000Z", "date", LABELS, FORMATTERS),
    ).toBe("Aug 27, 2026");
  });

  test("an object in a non-json column shows its JSON, not [object Object]", () => {
    expect(formatCellText({ a: 1 }, "string", LABELS, FORMATTERS)).toBe(
      '{"a":1}',
    );
  });
});

describe("editableText", () => {
  test("json is never edited as text", () => {
    expect(editableText({ a: 1 }, "json")).toBe("");
  });

  test("a file edits as its url", () => {
    expect(editableText("https://example.com/a.pdf", "file")).toBe(
      "https://example.com/a.pdf",
    );
  });

  test("a blank cell edits from empty", () => {
    expect(editableText(null, "string")).toBe("");
  });
});

describe("parseCellInput", () => {
  test("empty input clears the cell", () => {
    expect(parseCellInput("   ", "number")).toEqual({ ok: true, value: null });
  });

  test("a file parses like a url", () => {
    expect(parseCellInput("https://example.com/a.pdf", "file")).toEqual({
      ok: true,
      value: "https://example.com/a.pdf",
    });
    expect(parseCellInput("a.pdf", "file")).toEqual({
      ok: false,
      value: "a.pdf",
    });
  });

  test("a audio cell parses like a url", () => {
    expect(parseCellInput("https://example.com/a.mp3", "audio")).toEqual({
      ok: true,
      value: "https://example.com/a.mp3",
    });
    expect(parseCellInput("a.mp3", "audio")).toEqual({
      ok: false,
      value: "a.mp3",
    });
  });

  test("booleans accept the usual spellings", () => {
    expect(parseCellInput("yes", "boolean")).toEqual({ ok: true, value: true });
    expect(parseCellInput("0", "boolean")).toEqual({ ok: true, value: false });
  });

  test("an unparseable entry is kept rather than discarded", () => {
    expect(parseCellInput("abc", "number")).toEqual({
      ok: false,
      value: "abc",
    });
  });

  test("a date normalises to ISO", () => {
    expect(parseCellInput("2026-08-27T10:00:00Z", "date")).toEqual({
      ok: true,
      value: "2026-08-27T10:00:00.000Z",
    });
  });
});
