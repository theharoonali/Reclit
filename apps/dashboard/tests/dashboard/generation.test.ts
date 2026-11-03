import { describe, expect, it } from "bun:test";
import {
  type DashboardGeneration,
  GENERATION_STEP_KEYS,
  generationDetail,
  generationErrorKey,
  generationSteps,
  isTerminalGeneration,
} from "@/lib/dashboard/generation";

const at = new Date("2026-01-01T00:00:00.000Z");

const step = (
  phase: DashboardGeneration["phase"],
  detail: string | null,
  status: DashboardGeneration["log"][number]["status"] = "running",
): DashboardGeneration["log"][number] => ({
  phase,
  attempt: 1,
  status,
  detail,
  startedAt: at.toISOString(),
  finishedAt: null,
});

const generation = (
  overrides: Partial<DashboardGeneration> = {},
): DashboardGeneration => ({
  id: "gen-1",
  workspaceId: "ws-1",
  spreadsheetId: "sheet-1",
  source: "dashboard",
  status: "running",
  phase: "analyzing",
  attempt: 1,
  awaitBatchId: null,
  log: [],
  brief: null,
  result: null,
  error: null,
  model: null,
  usage: null,
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

const statuses = (value: DashboardGeneration | null) =>
  generationSteps(value).map((item) => `${item.key}:${item.status}`);

describe("isTerminalGeneration", () => {
  it("is true for completed, failed and cancelled only", () => {
    expect(isTerminalGeneration({ status: "completed" })).toBe(true);
    expect(isTerminalGeneration({ status: "failed" })).toBe(true);
    expect(isTerminalGeneration({ status: "cancelled" })).toBe(true);
    expect(isTerminalGeneration({ status: "pending" })).toBe(false);
    expect(isTerminalGeneration({ status: "running" })).toBe(false);
  });
});

describe("generationSteps", () => {
  it("lists every step pending without a generation, run included", () => {
    expect(generationSteps(null).map((item) => item.key)).toEqual([
      ...GENERATION_STEP_KEYS,
    ]);
    expect(
      generationSteps(null).every((item) => item.status === "pending"),
    ).toBe(true);
  });

  it("omits run when there is no batch to wait for", () => {
    expect(statuses(generation())).toEqual([
      "analyze:active",
      "propose:pending",
      "verify:pending",
      "apply:pending",
    ]);
  });

  it("keeps run while waiting for an onboarding batch", () => {
    expect(
      statuses(
        generation({ awaitBatchId: "batch-1", phase: "waiting_for_rows" }),
      ),
    ).toEqual([
      "run:active",
      "analyze:pending",
      "propose:pending",
      "verify:pending",
      "apply:pending",
    ]);
  });

  it("maps the laying out and retrying phases onto propose", () => {
    for (const phase of ["proposing", "laying_out", "retrying"] as const) {
      expect(statuses(generation({ phase }))).toEqual([
        "analyze:done",
        "propose:active",
        "verify:pending",
        "apply:pending",
      ]);
    }
    expect(statuses(generation({ phase: "verifying" }))[2]).toBe(
      "verify:active",
    );
    expect(statuses(generation({ phase: "applying" }))[3]).toBe("apply:active");
  });

  it("starts at the first step while queued", () => {
    expect(
      statuses(generation({ status: "pending", phase: "queued" })),
    ).toEqual([
      "analyze:active",
      "propose:pending",
      "verify:pending",
      "apply:pending",
    ]);
  });

  it("marks everything done once completed", () => {
    expect(
      statuses(generation({ status: "completed", phase: "done" })),
    ).toEqual(["analyze:done", "propose:done", "verify:done", "apply:done"]);
  });

  it("fails the current step when the generation failed or was cancelled", () => {
    expect(
      statuses(generation({ status: "failed", phase: "verifying" })),
    ).toEqual([
      "analyze:done",
      "propose:done",
      "verify:failed",
      "apply:pending",
    ]);
    expect(
      statuses(generation({ status: "cancelled", phase: "proposing" }))[1],
    ).toBe("propose:failed");
  });
});

describe("generationErrorKey", () => {
  it("maps the contract's codes and falls back to error", () => {
    expect(generationErrorKey("CONFLICT")).toBe("busy");
    expect(generationErrorKey("SERVICE_UNAVAILABLE")).toBe("unavailable");
    expect(generationErrorKey("BAD_GATEWAY")).toBe("dispatch");
    expect(generationErrorKey("NOT_FOUND")).toBe("error");
    expect(generationErrorKey(undefined)).toBe("error");
  });
});

describe("generationDetail", () => {
  it("returns the newest log entry's detail, or null", () => {
    expect(generationDetail(null)).toBeNull();
    expect(generationDetail(generation())).toBeNull();
    expect(
      generationDetail(
        generation({
          log: [
            step("analyzing", "Read 12 columns", "done"),
            step("proposing", "Drafting 6 cards"),
          ],
        }),
      ),
    ).toBe("Drafting 6 cards");
    expect(
      generationDetail(
        generation({
          log: [step("analyzing", "Read", "done"), step("proposing", null)],
        }),
      ),
    ).toBeNull();
  });
});
