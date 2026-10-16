import { describe, expect, it } from "bun:test";
import type { QueryIssue, WidgetData } from "@reclit/dashboard-engine";
import {
  toWidgetState,
  widgetIssueMessageKey,
} from "@/lib/dashboard/widget-state";

const issue = (code: QueryIssue["code"], detail?: string): QueryIssue => ({
  code,
  path: ["series", 0, "formula"],
  message: code,
  ...(detail === undefined ? {} : { detail }),
});

const data: WidgetData = { series: [], rows: [] };

describe("widgetIssueMessageKey", () => {
  it("maps an unknown column and a bad formula to their own messages", () => {
    expect(widgetIssueMessageKey(issue("UNKNOWN_COLUMN", "Revenue"))).toBe(
      "unknownColumn",
    );
    expect(widgetIssueMessageKey(issue("FORMULA_INVALID"))).toBe("formula");
  });

  it("maps every other rule to the generic query message", () => {
    expect(widgetIssueMessageKey(issue("GROUP_BY_REQUIRED"))).toBe("query");
    expect(widgetIssueMessageKey(issue("BUCKET_NOT_DATE", "Region"))).toBe(
      "query",
    );
  });
});

describe("toWidgetState", () => {
  it("is pending while the sheet loads", () => {
    expect(toWidgetState({ status: "pending", data: undefined })).toEqual({
      status: "pending",
    });
    expect(toWidgetState({ status: "success", data: undefined })).toEqual({
      status: "pending",
    });
  });

  it("is an error when the sheet could not be fetched", () => {
    expect(toWidgetState({ status: "error", data: undefined })).toEqual({
      status: "error",
    });
  });

  it("is ready with the engine's data", () => {
    expect(
      toWidgetState({ status: "success", data: { ok: true, data } }),
    ).toEqual({ status: "ready", data });
  });

  it("is invalid with the engine's first issue", () => {
    const first = issue("UNKNOWN_COLUMN", "Revenue");
    expect(
      toWidgetState({
        status: "success",
        data: { ok: false, issues: [first, issue("SORT_KEY")] },
      }),
    ).toEqual({ status: "invalid", issue: first });
  });
});
