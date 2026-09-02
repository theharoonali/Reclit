import { describe, expect, test } from "bun:test";
import {
  formatRunStatus,
  isKnownRunStatus,
  isTerminalRunStatus,
} from "@/lib/ai-spreadsheet/run-status";

describe("run status", () => {
  test("the four system statuses are known; a custom stage is not", () => {
    expect(isKnownRunStatus("pending")).toBe(true);
    expect(isKnownRunStatus("failed")).toBe(true);
    expect(isKnownRunStatus("analyzing")).toBe(false);
  });

  test("only completed and failed end a run", () => {
    expect(isTerminalRunStatus("completed")).toBe(true);
    expect(isTerminalRunStatus("failed")).toBe(true);
    expect(isTerminalRunStatus("running")).toBe(false);
    expect(isTerminalRunStatus("analyzing")).toBe(false);
  });

  test("a custom stage is shown tidied, never invented", () => {
    expect(formatRunStatus("analyzing")).toBe("Analyzing");
    expect(formatRunStatus("web_search")).toBe("Web search");
    expect(formatRunStatus("re-ranking")).toBe("Re ranking");
    expect(formatRunStatus("")).toBe("");
  });
});
