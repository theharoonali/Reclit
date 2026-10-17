import { describe, expect, test } from "bun:test";
import {
  type IslandInputs,
  isActiveStatus,
  isComposing,
  islandMode,
  islandWidthClass,
  isTerminalStatus,
} from "@/lib/assistant/island-state";

const AT_REST: IslandInputs = {
  status: null,
  draft: "",
  isEngaged: false,
  voice: "idle",
  lastTerminal: null,
  isSubmitting: false,
};

const mode = (overrides: Partial<IslandInputs>) =>
  islandMode({ ...AT_REST, ...overrides });

describe("islandMode", () => {
  test("nothing going on is idle", () => {
    expect(mode({})).toBe("idle");
  });

  test("hover or focus opens the field; text keeps it open", () => {
    expect(mode({ isEngaged: true })).toBe("open");
    expect(mode({ draft: "add a column" })).toBe("typing");
    expect(mode({ draft: "   " })).toBe("idle");
    expect(mode({ draft: "   ", isEngaged: true })).toBe("open");
  });

  test("the voice states outrank the draft", () => {
    expect(mode({ voice: "recording", draft: "half" })).toBe("recording");
    expect(mode({ voice: "transcribing", draft: "half" })).toBe("transcribing");
    // A voice error is not a mode: the field shows the message and stays open.
    expect(mode({ voice: "error", isEngaged: true })).toBe("open");
  });

  test("a start in flight shows as submitting", () => {
    expect(mode({ isSubmitting: true, draft: "x", voice: "recording" })).toBe(
      "submitting",
    );
  });

  test("an alive run is running, whatever the field holds", () => {
    expect(mode({ status: "pending", draft: "x", isEngaged: true })).toBe(
      "running",
    );
    expect(mode({ status: "thinking" })).toBe("running");
    expect(mode({ status: "working", voice: "recording" })).toBe("running");
  });

  test("a run waiting on an answer is awaiting", () => {
    expect(mode({ status: "awaiting_confirmation", isSubmitting: true })).toBe(
      "awaiting",
    );
  });

  test("a finished run is the result, from the run or from memory", () => {
    expect(mode({ status: "completed" })).toBe("result");
    expect(mode({ status: "failed", draft: "x" })).toBe("result");
    expect(mode({ status: "cancelled" })).toBe("result");
    expect(mode({ lastTerminal: "completed", isEngaged: true })).toBe("result");
  });
});

describe("islandWidthClass", () => {
  test("closed when idle, open for the field, wide for a run", () => {
    expect(islandWidthClass("idle")).toBe("w-island-closed");
    expect(islandWidthClass("idle", true)).toBe("w-island-action");
    expect(islandWidthClass("open", true)).toBe("w-island");
    expect(islandWidthClass("open")).toBe("w-island");
    expect(islandWidthClass("typing")).toBe("w-island");
    expect(islandWidthClass("recording")).toBe("w-island");
    expect(islandWidthClass("running")).toBe("w-island-wide");
    expect(islandWidthClass("awaiting")).toBe("w-island-wide");
    expect(islandWidthClass("result")).toBe("w-island-wide");
  });
});

describe("status predicates", () => {
  test("terminal and active are complements", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("awaiting_confirmation")).toBe(false);
    expect(isActiveStatus("pending")).toBe(true);
    expect(isActiveStatus("failed")).toBe(false);
  });

  test("the field is on screen in the composing modes only", () => {
    expect(isComposing("open")).toBe(true);
    expect(isComposing("submitting")).toBe(true);
    expect(isComposing("idle")).toBe(false);
    expect(isComposing("running")).toBe(false);
  });
});
