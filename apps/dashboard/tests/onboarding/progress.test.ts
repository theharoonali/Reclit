import { describe, expect, test } from "bun:test";
import type { DashboardGeneration } from "@/lib/dashboard/generation";
import { type ProgressState, progressFor } from "@/lib/onboarding/progress";

const idle: ProgressState = {
  stage: "name",
  hasUseCases: false,
  hasWebsite: false,
  isScraping: false,
  hasDocuments: false,
  isUploading: false,
  hasFile: false,
  isDescribing: false,
  isDescribed: false,
  isSuggesting: false,
  isCreating: false,
  isCreated: false,
  isRunning: false,
  hasGeneration: false,
  generation: null,
};

const at = new Date("2026-01-01T00:00:00.000Z");

const generation = (
  overrides: Partial<DashboardGeneration> = {},
): DashboardGeneration => ({
  id: "gen-1",
  workspaceId: "ws-1",
  spreadsheetId: "sheet-1",
  source: "onboarding",
  status: "running",
  phase: "analyzing",
  attempt: 1,
  awaitBatchId: "batch-1",
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

/** The wizard's state once the workspace exists and the last step has begun. */
const finishing: ProgressState = {
  ...idle,
  stage: "finishing",
  hasFile: true,
  isDescribed: true,
  isCreated: true,
};

/** The company steps come first; most tests read the workspace steps after them. */
const COMPANY_STEPS = 3;

const statuses = (state: ProgressState) =>
  progressFor(state)
    .slice(COMPANY_STEPS)
    .map((item) => `${item.key}:${item.status}`);

const companyStatuses = (state: ProgressState) =>
  progressFor(state)
    .slice(0, COMPANY_STEPS)
    .map((item) => `${item.key}:${item.status}`);

describe("progressFor — company steps", () => {
  test("each company step is active on its own screen", () => {
    expect(companyStatuses({ ...idle, stage: "purpose" })).toEqual([
      "purpose:active",
      "website:pending",
      "documents:pending",
    ]);
    expect(companyStatuses({ ...idle, stage: "website" })[1]).toBe(
      "website:active",
    );
    expect(companyStatuses({ ...idle, stage: "documents" })[2]).toBe(
      "documents:active",
    );
  });

  test("a step is done once there is something to show for it", () => {
    expect(
      companyStatuses({
        ...idle,
        hasUseCases: true,
        hasWebsite: true,
        hasDocuments: true,
      }),
    ).toEqual(["purpose:done", "website:done", "documents:done"]);
  });

  test("a skipped website or documents step stays pending past its screen", () => {
    expect(companyStatuses({ ...idle, hasUseCases: true })).toEqual([
      "purpose:done",
      "website:pending",
      "documents:pending",
    ]);
  });

  test("reading the website and uploading keep their step active", () => {
    expect(
      companyStatuses({
        ...idle,
        stage: "documents",
        hasWebsite: true,
        isScraping: true,
        hasDocuments: true,
        isUploading: true,
      }).slice(1),
    ).toEqual(["website:active", "documents:active"]);
  });
});

describe("progressFor", () => {
  test("lists the three company steps, the four wizard steps, the run and the four generation steps", () => {
    expect(progressFor(idle).map((item) => item.key)).toEqual([
      "purpose",
      "website",
      "documents",
      "upload",
      "describe",
      "columns",
      "create",
      "run",
      "analyze",
      "propose",
      "verify",
      "apply",
    ]);
  });

  test("everything is pending on the name screen; the upload is active on its own screen", () => {
    expect(statuses(idle).every((item) => item.endsWith(":pending"))).toBe(
      true,
    );
    expect(statuses({ ...idle, stage: "upload" })[0]).toBe("upload:active");
  });

  test("marks the file done and the description active while it is written", () => {
    expect(
      statuses({ ...idle, stage: "review", hasFile: true, isDescribing: true }),
    ).toEqual([
      "upload:done",
      "describe:active",
      "columns:pending",
      "create:pending",
      "run:pending",
      "analyze:pending",
      "propose:pending",
      "verify:pending",
      "apply:pending",
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

  test("the run is active while finish is pending, then while the row is announced but not seen", () => {
    expect(statuses({ ...finishing, isRunning: true }).slice(3)).toEqual([
      "create:done",
      "run:active",
      "analyze:pending",
      "propose:pending",
      "verify:pending",
      "apply:pending",
    ]);
    expect(statuses({ ...finishing, hasGeneration: true })[4]).toBe(
      "run:active",
    );
    expect(statuses(finishing)[4]).toBe("run:pending");
  });

  test("follows the generation: waiting for rows keeps the run active", () => {
    const waiting = generation({ phase: "waiting_for_rows" });
    expect(
      statuses({
        ...finishing,
        hasGeneration: true,
        generation: waiting,
      }).slice(4),
    ).toEqual([
      "run:active",
      "analyze:pending",
      "propose:pending",
      "verify:pending",
      "apply:pending",
    ]);
  });

  test("the run is done once the generation is past it, and when it had no batch", () => {
    const analyzing = generation({ phase: "analyzing" });
    expect(
      statuses({
        ...finishing,
        hasGeneration: true,
        generation: analyzing,
      }).slice(4),
    ).toEqual([
      "run:done",
      "analyze:active",
      "propose:pending",
      "verify:pending",
      "apply:pending",
    ]);
    const noBatch = generation({ awaitBatchId: null, phase: "proposing" });
    expect(
      statuses({
        ...finishing,
        hasGeneration: true,
        generation: noBatch,
      }).slice(4),
    ).toEqual([
      "run:done",
      "analyze:done",
      "propose:active",
      "verify:pending",
      "apply:pending",
    ]);
  });

  test("a completed generation is all done; a failed one marks its step failed", () => {
    const completed = generation({ status: "completed", phase: "done" });
    expect(
      statuses({
        ...finishing,
        hasGeneration: true,
        generation: completed,
      }).slice(4),
    ).toEqual([
      "run:done",
      "analyze:done",
      "propose:done",
      "verify:done",
      "apply:done",
    ]);
    const failed = generation({ status: "failed", phase: "verifying" });
    expect(
      statuses({ ...finishing, hasGeneration: true, generation: failed }).slice(
        4,
      ),
    ).toEqual([
      "run:done",
      "analyze:done",
      "propose:done",
      "verify:failed",
      "apply:pending",
    ]);
  });
});
