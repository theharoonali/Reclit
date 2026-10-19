import { describe, expect, test } from "bun:test";
import { type ProgressState, progressFor } from "@/lib/onboarding/progress";

const idle: ProgressState = {
  stage: "upload",
  hasFile: false,
  isDescribing: false,
  isDescribed: false,
  isSuggesting: false,
  isCreating: false,
  isCreated: false,
  isRecommending: false,
  isRunning: false,
};

const statuses = (state: ProgressState) =>
  progressFor(state).map((item) => `${item.key}:${item.status}`);

describe("progressFor", () => {
  test("starts with the upload active and everything else pending", () => {
    expect(statuses(idle)).toEqual([
      "upload:active",
      "describe:pending",
      "columns:pending",
      "create:pending",
      "cards:pending",
      "run:pending",
    ]);
  });

  test("marks the file done and the description active while it is written", () => {
    expect(
      statuses({ ...idle, stage: "review", hasFile: true, isDescribing: true }),
    ).toEqual([
      "upload:done",
      "describe:active",
      "columns:pending",
      "create:pending",
      "cards:pending",
      "run:pending",
    ]);
  });

  test("the columns step is active while suggesting and done once on that stage", () => {
    const base = {
      ...idle,
      stage: "columns" as const,
      hasFile: true,
      isDescribed: true,
    };
    expect(statuses({ ...base, isSuggesting: true })[2]).toBe("columns:active");
    expect(statuses(base)[2]).toBe("columns:done");
  });

  test("the cards step follows the workspace, and run is only ever active", () => {
    const widgets = {
      ...idle,
      stage: "widgets" as const,
      hasFile: true,
      isDescribed: true,
      isCreated: true,
    };
    expect(statuses({ ...widgets, isRecommending: true }).slice(2)).toEqual([
      "columns:done",
      "create:done",
      "cards:active",
      "run:pending",
    ]);
    expect(statuses({ ...widgets, isRunning: true }).slice(4)).toEqual([
      "cards:done",
      "run:active",
    ]);
  });
});
