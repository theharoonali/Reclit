import { describe, expect, test } from "bun:test";
import { cellTooltipContent } from "@/lib/ai-spreadsheet/cell-tooltip";
import type { ActiveRun, SheetFormatters } from "@/lib/ai-spreadsheet/types";
import { TEST_LABELS } from "../support/canvas";

const formatters: SheetFormatters = {
  number: new Intl.NumberFormat("en-US"),
  date: new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }),
};
const running: ActiveRun = {
  runId: "r",
  status: "running",
  createdAt: new Date("2026-10-21T10:00:00Z"),
};

const content = (
  value: Parameters<typeof cellTooltipContent>[0],
  type: Parameters<typeof cellTooltipContent>[1],
  run?: ActiveRun,
) => cellTooltipContent(value, type, run, TEST_LABELS, formatters);

describe("cellTooltipContent", () => {
  test("shows nothing for a blank cell with no run", () => {
    expect(content(null, "string")).toBeNull();
    expect(content("", "string")).toBeNull();
  });

  test("shows a long text value in full", () => {
    const long = "word ".repeat(200).trim();
    expect(content(long, "string")).toEqual({ text: long, status: null });
  });

  test("pretty-prints a JSON cell", () => {
    expect(content({ a: 1, b: "x" }, "json")?.text).toBe(
      '{\n  "a": 1,\n  "b": "x"\n}',
    );
  });

  test("shows a file or audio cell's URL, not the chip's name", () => {
    const url = "https://cdn.example.com/files/report-final.pdf";
    expect(content(url, "file")?.text).toBe(url);
    expect(content(url, "audio")?.text).toBe(url);
  });

  test("formats numbers and booleans as the cell paints them", () => {
    expect(content(1234.5, "number")?.text).toBe("1,234.5");
    expect(content(true, "boolean")?.text).toBe("True");
  });

  test("adds a working run's status, even on a blank cell", () => {
    expect(content(null, "string", running)).toEqual({
      text: "",
      status: "run:running",
    });
    expect(content("old", "string", running)).toEqual({
      text: "old",
      status: "run:running",
    });
  });
});
