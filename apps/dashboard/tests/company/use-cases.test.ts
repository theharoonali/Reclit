import { describe, expect, test } from "bun:test";
import { useCaseOptions } from "@/config/use-cases";
import {
  isUseCaseChange,
  toggleUseCase,
  toUseCaseUpdate,
  USE_CASES,
} from "@/lib/company/use-cases";

describe("toggleUseCase", () => {
  test("adds a missing key and removes a present one", () => {
    expect(toggleUseCase([], "HIRING")).toEqual(["HIRING"]);
    expect(toggleUseCase(["HIRING", "OTHER"], "HIRING")).toEqual(["OTHER"]);
  });

  test("keeps the card order whatever the click order", () => {
    expect(toggleUseCase(["OTHER", "HIRING"], "LEAD_RESEARCH")).toEqual([
      "LEAD_RESEARCH",
      "HIRING",
      "OTHER",
    ]);
  });
});

describe("toUseCaseUpdate", () => {
  test("drops the Other text unless OTHER is picked", () => {
    expect(toUseCaseUpdate(["HIRING"], "grants")).toEqual({
      useCases: ["HIRING"],
      useCaseOther: null,
    });
  });

  test("trims the Other text and sends null when it is blank", () => {
    expect(toUseCaseUpdate(["OTHER"], "  grants  ").useCaseOther).toBe(
      "grants",
    );
    expect(toUseCaseUpdate(["OTHER"], "   ").useCaseOther).toBeNull();
  });

  test("orders and de-duplicates the keys", () => {
    expect(toUseCaseUpdate(["OTHER", "HIRING", "HIRING"], "").useCases).toEqual(
      ["HIRING", "OTHER"],
    );
  });
});

describe("isUseCaseChange", () => {
  const saved = { useCases: ["HIRING", "OTHER"] as const, useCaseOther: "x" };

  test("is false for the saved pick in another order", () => {
    expect(
      isUseCaseChange(
        { useCases: [...saved.useCases], useCaseOther: "x" },
        ["OTHER", "HIRING"],
        " x ",
      ),
    ).toBe(false);
  });

  test("is true when a key or the Other text changes", () => {
    const before = { useCases: [...saved.useCases], useCaseOther: "x" };
    expect(isUseCaseChange(before, ["HIRING"], "x")).toBe(true);
    expect(isUseCaseChange(before, ["HIRING", "OTHER"], "y")).toBe(true);
  });
});

describe("useCaseOptions", () => {
  test("covers every use case once, in order, each with an icon", () => {
    expect(useCaseOptions.map((option) => option.key)).toEqual([...USE_CASES]);
    expect(new Set(useCaseOptions.map((o) => o.messageKey)).size).toBe(6);
    for (const option of useCaseOptions) expect(option.icon).toBeDefined();
  });
});
