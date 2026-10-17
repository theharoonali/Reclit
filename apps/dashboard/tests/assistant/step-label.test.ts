import { describe, expect, test } from "bun:test";
import { confirmLabel, stepLabel } from "@/lib/assistant/step-label";

describe("stepLabel", () => {
  test("a known tool maps to its own key with the named values", () => {
    expect(
      stepLabel({
        tool: "createColumn",
        input: { name: "Score", type: "number" },
      }),
    ).toEqual({
      key: "steps.createColumn",
      values: { name: "Score", type: "number" },
    });
  });

  test("a count passes through as a number for the plural", () => {
    expect(stepLabel({ tool: "appendRows", input: { count: 3 } })).toEqual({
      key: "steps.appendRows",
      values: { count: 3 },
    });
  });

  test("a missing or mistyped value still formats: '' for text, 0 for a number", () => {
    expect(stepLabel({ tool: "setCells", input: { column: 12 } })).toEqual({
      key: "steps.setCells",
      values: { column: 12, count: 0 },
    });
    expect(stepLabel({ tool: "removeColumn", input: {} })).toEqual({
      key: "steps.removeColumn",
      values: { column: "", count: 0 },
    });
  });

  test("fields the message does not interpolate are dropped", () => {
    expect(
      stepLabel({
        tool: "fillColumn",
        input: { column: "Status", value: "open", where: "x > 1" },
      }),
    ).toEqual({ key: "steps.fillColumn", values: { column: "Status" } });
  });

  test("a tool with no values yields an empty value map", () => {
    expect(
      stepLabel({ tool: "readRows", input: { startRow: 0, limit: 50 } }),
    ).toEqual({ key: "steps.readRows", values: {} });
  });

  test("an unknown tool degrades to the generic line with its name", () => {
    expect(stepLabel({ tool: "renameSheet", input: { name: "x" } })).toEqual({
      key: "steps.generic",
      values: { tool: "renameSheet" },
    });
  });
});

describe("confirmLabel", () => {
  test("asks about the column and how many cells it holds", () => {
    expect(
      confirmLabel({
        tool: "removeColumn",
        input: { column: "Score", count: 42 },
      }),
    ).toEqual({
      key: "confirm.removeColumn",
      values: { column: "Score", count: 42 },
    });
  });

  test("asks about the row count", () => {
    expect(confirmLabel({ tool: "removeRows", input: { count: 7 } })).toEqual({
      key: "confirm.removeRows",
      values: { count: 7 },
    });
  });

  test("asks about the widget by name", () => {
    expect(
      confirmLabel({
        tool: "removeWidget",
        input: { name: "Revenue", type: "bar" },
      }),
    ).toEqual({ key: "confirm.removeWidget", values: { name: "Revenue" } });
  });
});
