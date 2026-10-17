import { describe, expect, test } from "bun:test";
import { scopeForPath } from "@/config/assistant";

describe("scopeForPath", () => {
  test("the dashboard and the sheet each have a scope", () => {
    expect(scopeForPath("/")).toBe("dashboard");
    expect(scopeForPath("/ai-spreadsheet")).toBe("spreadsheet");
  });

  test("every other page hides the island", () => {
    expect(scopeForPath("/populate")).toBeNull();
    expect(scopeForPath("/settings")).toBeNull();
    expect(scopeForPath("/onboarding")).toBeNull();
    expect(scopeForPath("/form/abc")).toBeNull();
    expect(scopeForPath("/ai-spreadsheet/x")).toBeNull();
  });
});
