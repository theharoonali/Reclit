/**
 * CONTRACT — dashboard-generation
 * Feature doc: docs/features/dashboard-generation.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `DashboardGeneration`
 *   id             String                     pk, uuid
 *   workspaceId    String                     fk cascade → Workspace; indexed with updatedAt
 *   spreadsheetId  String                     fk cascade → Spreadsheet (the workspace's sheet, resolved at start)
 *   source         DashboardGenerationSource  ONBOARDING | DASHBOARD
 *   status         String                     uppercase; PENDING | RUNNING | COMPLETED | FAILED | CANCELLED;
 *                                             the last three are terminal
 *   phase          String                     uppercase; QUEUED | WAITING_FOR_ROWS | ANALYZING | PROPOSING |
 *                                             LAYING_OUT | VERIFYING | RETRYING | APPLYING | DONE; default QUEUED
 *   attempt        Int                        the proposal round, 0 before the first; default 0
 *   awaitBatchId   String?                    the onboarding run-ai batch the worker waits for before analyzing
 *   log            Json                       GenerationStep[] (default [])
 *   brief          Json?                      DashboardBrief, after the analyze phase
 *   result         Json?                      GenerationResult, once completed
 *   error          Json?                      { name, message }, once failed
 *   model          String?                    the model id that answered
 *   usage          Json?                      { inputTokens, outputTokens, totalTokens }, every call summed
 *   triggerRunId   String?                    the Trigger.dev run id — cancel's handle, never on the wire
 *   createdAt      DateTime                   now(), indexed
 *   updatedAt      DateTime                   @updatedAt; its ms value is the SSE event id
 *   Partial unique index `DashboardGeneration_active_workspace_key` (workspaceId WHERE status
 *   NOT IN terminal): one active generation per workspace. Trigger
 *   `dashboard_generation_notify` publishes every insert/update id on channel
 *   `dashboard_generation_changed`.
 *
 * MODEL  DashboardGeneration = {
 *   id: string; workspaceId: string; spreadsheetId: string;
 *   source: "onboarding" | "dashboard";
 *   status: "pending" | "running" | "completed" | "failed" | "cancelled";
 *   phase: "queued" | "waiting_for_rows" | "analyzing" | "proposing" | "laying_out" | "verifying" |
 *          "retrying" | "applying" | "done";
 *   attempt: number; awaitBatchId: string | null;
 *   log: GenerationStep[]; brief: DashboardBrief | null; result: GenerationResult | null;
 *   error: { name: string; message: string } | null;
 *   model: string | null; usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
 *   createdAt: Date; updatedAt: Date;
 * }
 * GenerationStep = {                      // one phase of one attempt, in order — the progress list
 *   phase: GenerationPhase; attempt: number;
 *   status: "running" | "done" | "failed";
 *   detail: string | null;                // ≤ 300 chars, a short line under the step ("5 cards")
 *   startedAt: string; finishedAt: string | null;  // ISO timestamps (they live in JSON)
 * }
 * DashboardBrief = {                      // the analyze phase's answer
 *   subject: string;                      // one line saying what one row is, 1..200
 *   questions: string[];                  // 1..8, most valuable first
 *   columns: { name: string; use: "measure" | "axis" | "category" | "identifier" | "noise"; note?: string }[];
 * }                                       // only columns the sheet has; unknown names are dropped
 * VerifyIssue = {                         // one thing wrong with one proposed card
 *   code: "QUERY_INVALID" | "EMPTY_RESULT" | "SINGLE_GROUP" | "ALL_NULL" | "TOO_MANY_SLICES" |
 *         "TOO_MANY_CATEGORIES" | "LONG_LABELS" | "CONSTANT_SERIES" | "NON_MEASURE_AGGREGATE" |
 *         "ID_COUNT_STAT" | "DUPLICATE_CARD" | "UNPARSABLE";   // the engine's codes + the strict-parse failure
 *   severity: "error" | "warn";           // an error drops the card; a warn is a chart that reads badly
 *   cardIndex: number; cardName: string; message: string; detail?: string;
 * }
 * DashboardReview = {                     // the review phase's answer
 *   pass: boolean; reasons: string[];     // ≤ 8, ≤ 300 chars each, most important first
 *   cards: { name: string; verdict: "keep" | "fix" | "drop"; note?: string }[];
 * }
 * GenerationResult = {                    // what a completed generation did
 *   cardCount: number; applied: boolean;
 *   attempts: 1 | 2;                      // proposal rounds made
 *   issues: VerifyIssue[];                // of the attempt that was kept (warnings included)
 *   review: DashboardReview | null;       // of the attempt that was kept; null when no card reached the reviewer
 *   reason: "ok" | "no_value";            // no_value: no card survived, the dashboard was left as it was
 * }
 * GenerationChange =
 *   | { type: "snapshot"; generation: DashboardGeneration | null }  // the active generation, on (re)connect
 *   | { type: "generation"; generation: DashboardGeneration }       // one row after an insert or update
 *   | { type: "closed" }                                            // finished and nothing active; last event
 * Dates cross the wire as real Date objects (superjson). Status, phase and
 * source are lowercase on the wire and uppercase in the database.
 *
 * PROCEDURES
 * | Procedure                    | Kind         | Payload                                   | Response                        | Errors                                                   |
 * | ---------------------------- | ------------ | ----------------------------------------- | ------------------------------- | -------------------------------------------------------- |
 * | dashboardGeneration.start    | mutation     | { workspaceId; source: "dashboard" | "onboarding" } | DashboardGeneration (pending) | BAD_REQUEST, NOT_FOUND, CONFLICT, BAD_GATEWAY, SERVICE_UNAVAILABLE |
 * | dashboardGeneration.byId     | query        | { id }                                    | DashboardGeneration             | BAD_REQUEST, NOT_FOUND                                   |
 * | dashboardGeneration.active   | query        | { workspaceId }                           | DashboardGeneration | null      | BAD_REQUEST                                              |
 * | dashboardGeneration.latest   | query        | { workspaceId }                           | DashboardGeneration | null      | BAD_REQUEST                                              |
 * | dashboardGeneration.cancel   | mutation     | { id }                                    | DashboardGeneration (cancelled) | BAD_REQUEST, NOT_FOUND, CONFLICT                         |
 * | dashboardGeneration.onChange | subscription | { workspaceId; lastEventId? }             | SSE of tracked GenerationChange | BAD_REQUEST                                              |
 *
 * NOTES
 * - `start` records one generation `pending` / `queued` for the workspace's
 *   own sheet and asks the Trigger.dev worker (`generate-dashboard`) to
 *   execute it. An unknown workspace is NOT_FOUND (`WORKSPACE_NOT_FOUND`); a
 *   workspace without a sheet is NOT_FOUND (`SPREADSHEET_NOT_FOUND`). Without
 *   a `GOOGLE_GENERATIVE_AI_API_KEY` on the api it is SERVICE_UNAVAILABLE
 *   (`DASHBOARD_GENERATION_UNAVAILABLE`) and nothing is written. One active
 *   generation per workspace: a second `start` while one is pending / running
 *   is CONFLICT (`DASHBOARD_GENERATION_BUSY`). When the worker cannot be
 *   reached the row is flipped to `failed` with `error: { name, message }` and
 *   the call is BAD_GATEWAY (`DASHBOARD_GENERATION_DISPATCH_FAILED`). With no
 *   worker registered (tests, an api started without `TRIGGER_SECRET_KEY`'s
 *   dispatcher) the generation stays pending. The tRPC `start` never sets
 *   `awaitBatchId`; `onboarding.finish` starts the generation in-process with
 *   `source: "onboarding"` and the run-ai batch it just created.
 * - The worker (`src/trigger/generate-dashboard.ts`) first waits for the
 *   `awaitBatchId` batch to finish (`waiting_for_rows`, a `wait.for` sleep of
 *   5 s between looks, 120 looks at most), then: `analyzing` — the sheet is
 *   profiled and the model writes the brief (`setBrief`); `proposing` — the
 *   model answers cards; `laying_out` — the cards are packed into full rows
 *   (stats first, then charts, then tables); `verifying` — every card is run
 *   over the sheet by the engine and each with an `error` issue is dropped,
 *   then a reviewer model judges the survivors and may `drop` more. An
 *   attempt passes when nothing was dropped, the reviewer passed it and at
 *   least 3 cards remain. A failed first attempt is retried once
 *   (`retrying` → `proposing` 2) with every card, issue, the layout and the
 *   reviewer's reasons fed back in a `<previous-attempt>` block; the best
 *   attempt (a passing one, else the most cards, then the fewest warnings) is
 *   then `applying`-ed through `dashboard.replace` — the whole dashboard is
 *   swapped. No surviving card at all: nothing is applied and `result.reason`
 *   is `no_value`. The row is `completed` with `result`, `model` and `usage`
 *   summed over every call; an unreadable brief or any other failure is
 *   `failed` with `error`. Caps: at most 8 cards per proposal, 2 attempts.
 * - Each phase the worker enters appends a `running` entry to `log` and
 *   closes the previous one as `done`; `complete` closes the last one `done`,
 *   `fail` and `cancel` close it `failed`. `phase` and `attempt` always
 *   mirror the open entry. The row is the truth: the progress UI renders
 *   `log`, `brief` and `result` from the stream and nothing else.
 * - `cancel` flips the row to `cancelled` first and then tells the worker,
 *   best effort; the worker re-reads the row between phases and stops on a
 *   cancelled one even when the Trigger.dev cancel never arrives. A finished
 *   generation is CONFLICT (`DASHBOARD_GENERATION_FINISHED`). A dashboard
 *   already applied stays applied.
 * - `active` is the one generation that is not terminal, or null — what the
 *   page checks on load before subscribing. `latest` is the newest row,
 *   finished or not — what a reload shows.
 * - The stream is a generation, not a socket. `onChange` streams one
 *   workspace: with `lastEventId` it first replays every row whose
 *   `updatedAt >= lastEventId` (oldest first, at most 100), then sends a
 *   `snapshot` (the active generation or null), then a `generation` event per
 *   change as it happens; when a terminal event leaves the workspace with no
 *   active generation it sends `{ type: "closed" }` as the last event and
 *   ends. Event ids are `String(generation.updatedAt.getTime())`; a
 *   `snapshot`'s id is the workspace's newest `updatedAt` ("0" with no rows).
 *   tRPC re-sends the last id on reconnect, so a client must apply events
 *   idempotently and stop subscribing on `closed`.
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ColumnProfile } from "@reclit/dashboard-engine";
import {
  CHART_SENSE_RULES,
  UNTRUSTED_DATA_RULE,
  WIDGET_GRAMMAR,
} from "../ai/assistant-prompt";
import type { BriefGenerator } from "../ai/dashboard-brief";
import {
  buildAnalyzePrompt,
  buildProposePrompt,
  buildReviewPrompt,
  describeBrief,
  type ProposalFeedback,
} from "../ai/dashboard-prompt";
import type { ProposalGenerator } from "../ai/dashboard-propose";
import type { ReviewGenerator } from "../ai/dashboard-review";
import { pingDatabase } from "../db/prisma";
import { DashboardGenerationFinishedError } from "../modules/dashboard-generation/dashboard-generation.errors";
import { dashboardGenerationFeed } from "../modules/dashboard-generation/dashboard-generation.feed";
import type {
  DashboardBrief,
  DashboardGeneration,
  GenerationChange,
  GenerationPhase,
  GenerationResult,
  VerifyIssue,
} from "../modules/dashboard-generation/dashboard-generation.schema";
import {
  MAX_ATTEMPTS,
  MAX_CARDS,
  MIN_CARDS,
} from "../modules/dashboard-generation/dashboard-generation.schema";
import { dashboardGenerationService } from "../modules/dashboard-generation/dashboard-generation.service";
import { dashboardGenerationControlService } from "../modules/dashboard-generation/dashboard-generation-control.service";
import {
  DashboardBriefUnusableError,
  dashboardGenerationPipelineService,
  describeLayout,
  type PipelineDeps,
  parseBrief,
  parseReview,
  pickBest,
  toGenerationCard,
  unitOrNothing,
} from "../modules/dashboard-generation/dashboard-generation-pipeline.service";
import {
  makeIsolatedOwnerWorkspace,
  makeWorkspace,
  removeUser,
  removeWorkspace,
} from "./support/fixtures";
import {
  caller,
  callerWithSignal,
  expectDate,
  expectError,
  expectTRPCError,
  nextTracked,
} from "./support/trpc";

// Skips (rather than fails) when DATABASE_URL points nowhere, so a checkout
// without a reachable database still passes CI.
const dbUp = await pingDatabase();

// One workspace with a 24-row orders sheet (the engine's verify fixture,
// seeded through the caller). The pipeline suite applies dashboards to it;
// everything else only starts and cancels generations on it.
let workspaceId = "";
let sheetId = "";
let savedKey: string | undefined;
const workspaces: string[] = [];

const usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };

/**
 * Twenty-four orders: an id, three regions, three statuses, a distinct
 * revenue per row, a varying cost, a month per row and a year. Profiled, the
 * roles come out identifier, category, category, measure, measure, time, year.
 */
async function seedOrders(name: string) {
  const workspace = await makeWorkspace(name);
  workspaces.push(workspace.id);
  const id = workspace.spreadsheetId;
  if (!id) throw new Error("expected the workspace's sheet");
  const columns = [
    { name: "Order ID", type: "number" },
    { name: "Region", type: "string" },
    { name: "Status", type: "string" },
    { name: "Revenue", type: "number" },
    { name: "Cost", type: "number" },
    { name: "Ordered At", type: "date" },
    { name: "Year", type: "number" },
  ] as const;
  const indexes: number[] = [];
  for (const column of columns) {
    indexes.push(
      (await caller.spreadsheet.createColumn({ id, ...column })).index,
    );
  }
  // One row per call: a bulk `updateCells` of 168 cells outruns the remote
  // database's interactive-transaction timeout.
  for (let row = 0; row < 24; row += 1) {
    const values: (string | number)[] = [
      row + 1,
      ["North", "South", "West"][row % 3] ?? "North",
      ["Open", "Won", "Lost"][row % 3] ?? "Open",
      100 + row * 37,
      Math.round((30 + row * 11.3) * 100) / 100,
      `2026-${String((row % 12) + 1).padStart(2, "0")}-10T00:00:00.000Z`,
      2026,
    ];
    await caller.spreadsheet.updateRow({
      id,
      rowIndex: row,
      cells: values.map((value, column) => ({
        columnIndex: indexes[column] ?? 0,
        value,
      })),
    });
  }
  return { workspaceId: workspace.id, sheetId: id };
}

async function startGeneration(workspace = workspaceId) {
  return caller.dashboardGeneration.start({
    workspaceId: workspace,
    source: "dashboard",
  });
}

/** Ends a generation so the next test can start one (the index allows one at a time). */
async function finish(id: string): Promise<void> {
  await dashboardGenerationService.cancel(id).catch(() => {});
}

/** Runs `body` with a fresh pending generation and always ends it. */
async function withGeneration(
  body: (generation: DashboardGeneration) => Promise<void>,
): Promise<void> {
  const generation = await startGeneration();
  try {
    await body(generation);
  } finally {
    await finish(generation.id);
  }
}

/** A dispatcher that records what the api asked of the worker. */
function recordingDispatcher() {
  const calls = { trigger: [] as string[], cancel: [] as string[] };
  dashboardGenerationControlService.setDispatcher({
    trigger: async (generation) => {
      calls.trigger.push(generation.id);
      return { id: `run_${generation.id}` };
    },
    cancel: async (triggerRunId) => {
      calls.cancel.push(triggerRunId);
    },
  });
  return calls;
}

const result = (over: Partial<GenerationResult> = {}): GenerationResult => ({
  cardCount: 4,
  applied: true,
  attempts: 1,
  issues: [],
  review: { pass: true, reasons: [], cards: [] },
  reason: "ok",
  ...over,
});

beforeAll(async () => {
  savedKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "contract-test-key";
  if (!dbUp) return;
  const seeded = await seedOrders("dashboard generation contract");
  workspaceId = seeded.workspaceId;
  sheetId = seeded.sheetId;
});

afterAll(async () => {
  if (savedKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  else process.env.GOOGLE_GENERATIVE_AI_API_KEY = savedKey;
  dashboardGenerationControlService.setDispatcher(null);
  await dashboardGenerationFeed.stop();
  for (const id of workspaces) await removeWorkspace(id);
});

describe.skipIf(!dbUp)("dashboardGeneration.start", () => {
  it("records a pending generation for the workspace's sheet with the minimal payload", async () => {
    await withGeneration(async (generation) => {
      expect(generation).toMatchObject({
        workspaceId,
        spreadsheetId: sheetId,
        source: "dashboard",
        status: "pending",
        phase: "queued",
        attempt: 0,
        awaitBatchId: null,
        log: [],
        brief: null,
        result: null,
        error: null,
        model: null,
        usage: null,
      });
      expect(typeof generation.id).toBe("string");
      expectDate(generation.createdAt);
      expectDate(generation.updatedAt);
      expect(
        await caller.dashboardGeneration.byId({ id: generation.id }),
      ).toEqual(generation);
    });
  });

  it("rejects a blank workspaceId and an unknown source (BAD_REQUEST)", async () => {
    await expectTRPCError(
      caller.dashboardGeneration.start({
        workspaceId: "",
        source: "dashboard",
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.dashboardGeneration.start({
        workspaceId,
        source: "assistant" as never,
      }),
      "BAD_REQUEST",
    );
  });

  it("rejects an unknown workspace and a workspace without a sheet (NOT_FOUND)", async () => {
    await expectTRPCError(startGeneration("does-not-exist"), "NOT_FOUND");
    const isolated = await makeIsolatedOwnerWorkspace();
    try {
      await expectTRPCError(startGeneration(isolated.workspaceId), "NOT_FOUND");
    } finally {
      await removeUser(isolated.userId);
    }
  });

  it("is SERVICE_UNAVAILABLE without a Gemini key on the api, and writes nothing", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    try {
      await expectTRPCError(startGeneration(), "SERVICE_UNAVAILABLE");
    } finally {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "contract-test-key";
    }
    expect(await caller.dashboardGeneration.active({ workspaceId })).toBeNull();
  });

  it("allows one active generation per workspace (CONFLICT), then the next after it ends", async () => {
    const first = await startGeneration();
    await expectTRPCError(startGeneration(), "CONFLICT");
    await finish(first.id);
    await withGeneration(async (second) => {
      expect(second.id).not.toBe(first.id);
    });
  });

  it("hands the generation to the dispatcher and keeps the worker's run id", async () => {
    const calls = recordingDispatcher();
    try {
      await withGeneration(async (generation) => {
        expect(calls.trigger).toEqual([generation.id]);
        expect(
          await dashboardGenerationService.controlInfo(generation.id),
        ).toEqual({
          status: "pending",
          triggerRunId: `run_${generation.id}`,
        });
        // Never on the wire.
        expect(generation).not.toHaveProperty("triggerRunId");
      });
    } finally {
      dashboardGenerationControlService.setDispatcher(null);
    }
  });

  it("fails the generation and answers BAD_GATEWAY when the dispatcher throws", async () => {
    dashboardGenerationControlService.setDispatcher({
      trigger: async () => {
        throw new Error("worker unreachable");
      },
      cancel: async () => {},
    });
    try {
      await expectTRPCError(startGeneration(), "BAD_GATEWAY");
      const latest = await caller.dashboardGeneration.latest({ workspaceId });
      expect(latest).toMatchObject({
        status: "failed",
        error: { name: "Error", message: "worker unreachable" },
      });
      expect(
        await caller.dashboardGeneration.active({ workspaceId }),
      ).toBeNull();
    } finally {
      dashboardGenerationControlService.setDispatcher(null);
    }
  });

  it("an in-process caller may start a generation from onboarding, waiting for a batch", async () => {
    const generation = await dashboardGenerationControlService.start({
      workspaceId,
      source: "onboarding",
      awaitBatchId: "batch-contract",
    });
    try {
      expect(generation).toMatchObject({
        source: "onboarding",
        awaitBatchId: "batch-contract",
        status: "pending",
      });
    } finally {
      await finish(generation.id);
    }
  });
});

describe.skipIf(!dbUp)("dashboardGeneration.byId", () => {
  it("rejects a blank id (BAD_REQUEST) and an unknown id (NOT_FOUND)", async () => {
    await expectTRPCError(
      caller.dashboardGeneration.byId({ id: "" }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.dashboardGeneration.byId({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("dashboardGeneration.active / latest", () => {
  it("active is the pending generation, null once it ended; latest keeps the finished one", async () => {
    const fresh = await makeWorkspace("generation active");
    workspaces.push(fresh.id);
    expect(
      await caller.dashboardGeneration.active({ workspaceId: fresh.id }),
    ).toBeNull();
    expect(
      await caller.dashboardGeneration.latest({ workspaceId: fresh.id }),
    ).toBeNull();

    const generation = await startGeneration(fresh.id);
    expect(
      await caller.dashboardGeneration.active({ workspaceId: fresh.id }),
    ).toEqual(generation);
    expect(
      await caller.dashboardGeneration.latest({ workspaceId: fresh.id }),
    ).toEqual(generation);

    const cancelled = await caller.dashboardGeneration.cancel({
      id: generation.id,
    });
    expect(
      await caller.dashboardGeneration.active({ workspaceId: fresh.id }),
    ).toBeNull();
    expect(
      await caller.dashboardGeneration.latest({ workspaceId: fresh.id }),
    ).toEqual(cancelled);

    const next = await startGeneration(fresh.id);
    expect(
      (await caller.dashboardGeneration.latest({ workspaceId: fresh.id }))?.id,
    ).toBe(next.id);
    await finish(next.id);
  });

  it("reject a blank workspaceId (BAD_REQUEST)", async () => {
    await expectTRPCError(
      caller.dashboardGeneration.active({ workspaceId: "" }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.dashboardGeneration.latest({ workspaceId: "" }),
      "BAD_REQUEST",
    );
  });
});

describe.skipIf(!dbUp)("dashboardGeneration.cancel", () => {
  it("cancels a pending generation, closes its open step and tells the worker", async () => {
    const calls = recordingDispatcher();
    try {
      const generation = await startGeneration();
      await dashboardGenerationService.markRunning(
        generation.id,
        "analyzing",
        0,
      );
      const cancelled = await caller.dashboardGeneration.cancel({
        id: generation.id,
      });
      expect(cancelled).toMatchObject({
        id: generation.id,
        status: "cancelled",
        phase: "analyzing",
      });
      expect(cancelled.log).toHaveLength(1);
      expect(cancelled.log[0]).toMatchObject({
        phase: "analyzing",
        status: "failed",
      });
      expect(cancelled.log[0]?.finishedAt).not.toBeNull();
      expect(calls.cancel).toEqual([`run_${generation.id}`]);
      expect(
        await caller.dashboardGeneration.active({ workspaceId }),
      ).toBeNull();
    } finally {
      dashboardGenerationControlService.setDispatcher(null);
    }
  });

  it("rejects an unknown id (NOT_FOUND), a blank id (BAD_REQUEST) and a finished generation (CONFLICT)", async () => {
    await expectTRPCError(
      caller.dashboardGeneration.cancel({ id: "does-not-exist" }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      caller.dashboardGeneration.cancel({ id: "" }),
      "BAD_REQUEST",
    );
    const generation = await startGeneration();
    await caller.dashboardGeneration.cancel({ id: generation.id });
    await expectTRPCError(
      caller.dashboardGeneration.cancel({ id: generation.id }),
      "CONFLICT",
    );
  });
});

describe.skipIf(!dbUp)("the worker's transitions (service)", () => {
  const brief: DashboardBrief = {
    subject: "one customer order",
    questions: ["How much revenue?"],
    columns: [{ name: "Revenue", use: "measure" }],
  };

  it("walks the phases: each appends a running step and closes the previous as done", async () => {
    await withGeneration(async ({ id }) => {
      const analyzing = await dashboardGenerationService.markRunning(
        id,
        "analyzing",
        0,
      );
      expect(analyzing).toMatchObject({
        status: "running",
        phase: "analyzing",
        attempt: 0,
      });
      expect(analyzing.log).toEqual([
        {
          phase: "analyzing",
          attempt: 0,
          status: "running",
          detail: null,
          startedAt: expect.any(String),
          finishedAt: null,
        },
      ]);

      const withBrief = await dashboardGenerationService.setBrief(id, brief);
      expect(withBrief.brief).toEqual(brief);

      const proposing = await dashboardGenerationService.markRunning(
        id,
        "proposing",
        1,
        "x".repeat(400),
      );
      expect(proposing).toMatchObject({ phase: "proposing", attempt: 1 });
      expect(proposing.log).toHaveLength(2);
      expect(proposing.log[0]).toMatchObject({
        phase: "analyzing",
        status: "done",
        finishedAt: expect.any(String),
      });
      expect(proposing.log[1]).toMatchObject({
        phase: "proposing",
        attempt: 1,
        status: "running",
        finishedAt: null,
      });
      // A long detail is clipped to its cap.
      expect(proposing.log[1]?.detail).toHaveLength(300);
      expect(proposing.log[1]?.detail?.endsWith("…")).toBe(true);
      expect(proposing.brief).toEqual(brief);

      const completed = await dashboardGenerationService.complete(id, {
        result: result(),
        model: "fake-model",
        usage,
      });
      expect(completed).toMatchObject({
        status: "completed",
        phase: "done",
        attempt: 1,
        result: result(),
        model: "fake-model",
        usage,
        error: null,
      });
      expect(completed.log.map((step) => step.status)).toEqual([
        "done",
        "done",
      ]);
      expect(completed.log[1]?.finishedAt).not.toBeNull();

      // A finished generation never moves again.
      await expectError(
        dashboardGenerationService.markRunning(id, "applying", 1),
        DashboardGenerationFinishedError,
      );
      await expectError(
        dashboardGenerationService.setBrief(id, brief),
        DashboardGenerationFinishedError,
      );
      expect(
        await caller.dashboardGeneration.active({ workspaceId }),
      ).toBeNull();
    });
  });

  it("fail closes the open step as failed and records the error; a cancelled row refuses the worker", async () => {
    await withGeneration(async ({ id }) => {
      await dashboardGenerationService.markRunning(id, "proposing", 1);
      const failed = await dashboardGenerationService.fail(id, {
        name: "DashboardBriefUnusable",
        message: "nothing to propose from",
      });
      expect(failed).toMatchObject({
        status: "failed",
        phase: "proposing",
        error: {
          name: "DashboardBriefUnusable",
          message: "nothing to propose from",
        },
        result: null,
      });
      expect(failed.log).toEqual([
        expect.objectContaining({
          phase: "proposing",
          status: "failed",
          finishedAt: expect.any(String),
        }),
      ]);
      await expectError(
        dashboardGenerationService.complete(id, {
          result: result(),
          model: null,
          usage: null,
        }),
        DashboardGenerationFinishedError,
      );
    });

    await withGeneration(async ({ id }) => {
      await caller.dashboardGeneration.cancel({ id });
      await expectError(
        dashboardGenerationService.markRunning(id, "analyzing", 0),
        DashboardGenerationFinishedError,
      );
      await expectError(
        dashboardGenerationService.fail(id, { name: "Error", message: "late" }),
        DashboardGenerationFinishedError,
      );
    });
  });
});

describe.skipIf(!dbUp)("dashboardGeneration.onChange", () => {
  /** A stream through its own abortable caller. */
  async function openStream(workspace: string, lastEventId?: string) {
    const controller = new AbortController();
    const stream = await callerWithSignal(
      controller.signal,
    ).dashboardGeneration.onChange({
      workspaceId: workspace,
      ...(lastEventId !== undefined && { lastEventId }),
    });
    return { controller, events: stream[Symbol.asyncIterator]() };
  }

  it("rejects a blank workspaceId (BAD_REQUEST)", async () => {
    await expectTRPCError(
      caller.dashboardGeneration.onChange({ workspaceId: "" }),
      "BAD_REQUEST",
    );
  });

  it("streams a snapshot, every change, then closes itself when the generation ends", async () => {
    const fresh = await makeWorkspace("generation stream");
    workspaces.push(fresh.id);
    const { controller, events } = await openStream(fresh.id);
    try {
      const snapshot = await nextTracked<GenerationChange>(events);
      expect(snapshot.data).toEqual({ type: "snapshot", generation: null });
      expect(snapshot.id).toBe("0");

      const generation = await startGeneration(fresh.id);
      const created = await nextTracked<GenerationChange>(events);
      expect(created.data).toMatchObject({
        type: "generation",
        generation: {
          id: generation.id,
          status: "pending",
          phase: "queued",
          workspaceId: fresh.id,
        },
      });
      expect(created.id).toBe(String(generation.updatedAt.getTime()));

      // Another workspace's generation is not streamed here.
      await withGeneration(async () => {});

      await dashboardGenerationService.markRunning(
        generation.id,
        "analyzing",
        0,
      );
      const running = await nextTracked<GenerationChange>(events);
      expect(running.data).toMatchObject({
        type: "generation",
        generation: {
          id: generation.id,
          status: "running",
          phase: "analyzing",
          log: [
            expect.objectContaining({ phase: "analyzing", status: "running" }),
          ],
        },
      });

      const done = await dashboardGenerationService.complete(generation.id, {
        result: result(),
        model: "fake-model",
        usage,
      });
      const completed = await nextTracked<GenerationChange>(events);
      expect(completed.data).toMatchObject({
        type: "generation",
        generation: {
          id: generation.id,
          status: "completed",
          phase: "done",
          result: result(),
        },
      });
      expect(completed.id).toBe(String(done.updatedAt.getTime()));

      const closed = await nextTracked<GenerationChange>(events);
      expect(closed.data).toEqual({ type: "closed" });
      expect((await events.next()).done).toBe(true);

      // A reconnecting client replays from its last event id, then gets the
      // snapshot again — null, the generation is terminal — and stays open.
      const resumed = await openStream(fresh.id, created.id);
      try {
        const replayed = await nextTracked<GenerationChange>(resumed.events);
        expect(replayed.data).toMatchObject({
          type: "generation",
          generation: { id: generation.id, status: "completed" },
        });
        const resnapshot = await nextTracked<GenerationChange>(resumed.events);
        expect(resnapshot.data).toEqual({ type: "snapshot", generation: null });
        expect(resnapshot.id).toBe(completed.id);
      } finally {
        resumed.controller.abort();
        await resumed.events.return?.();
      }
    } finally {
      controller.abort();
      await events.return?.();
    }
  });

  it("a fresh subscriber sees the active generation in its snapshot", async () => {
    await withGeneration(async (generation) => {
      const { controller, events } = await openStream(workspaceId);
      try {
        const snapshot = await nextTracked<GenerationChange>(events);
        expect(snapshot.data).toMatchObject({
          type: "snapshot",
          generation: { id: generation.id, status: "pending" },
        });
        expect(snapshot.id).toBe(String(generation.updatedAt.getTime()));
      } finally {
        controller.abort();
        await events.return?.();
      }
    });
  });
});

/* --------------------------------------- the pipeline, driven with fakes */

type Call = { system: string; prompt: string };

/** A raw card as the model answers it (the lenient propose shape). */
const rawCard = (
  name: string,
  type: string,
  formula: string,
  groupBy?: string,
  over: Record<string, unknown> = {},
) => ({
  name,
  type,
  query: {
    ...(groupBy && { groupBy: { column: groupBy } }),
    series: [{ key: "v", label: name, formula }],
  },
  ...over,
});

const GOOD = {
  revenue: rawCard("Total revenue", "stat", "SUM({Revenue})"),
  orders: rawCard("Orders", "stat", "COUNT()"),
  byRegion: rawCard("Revenue by region", "bar", "SUM({Revenue})", "Region"),
  costByStatus: rawCard("Cost by status", "bar", "SUM({Cost})", "Status"),
};

const BAD = {
  sumOfYears: rawCard("Sum of years", "stat", "SUM({Year})"),
  pieByOrder: rawCard("Revenue by order", "pie", "SUM({Revenue})", "Order ID"),
  bogus: { name: "Bogus", type: "bogus", query: { series: [] } },
};

const BRIEF: DashboardBrief = {
  subject: "one customer order",
  questions: ["How much revenue, and where from?", "What does it cost?"],
  columns: [
    { name: "Order ID", use: "identifier" },
    { name: "Region", use: "category", note: "three sales regions" },
    { name: "Revenue", use: "measure" },
    { name: "Ghost", use: "measure" }, // not a column of the sheet
  ],
};

/** Fakes that record every call; `propose` and `review` answer per attempt. */
function fakes(input: {
  brief?: unknown;
  propose: unknown[][];
  review: unknown[];
}) {
  const seen = {
    analyze: [] as Call[],
    propose: [] as Call[],
    review: [] as Call[],
    phases: [] as [GenerationPhase, number][],
    briefs: [] as DashboardBrief[],
  };
  const analyze: BriefGenerator = async (call) => {
    seen.analyze.push(call);
    return { brief: input.brief ?? BRIEF, model: "fake-analyze", usage };
  };
  const propose: ProposalGenerator = async (call) => {
    const cards = input.propose[seen.propose.length] ?? [];
    seen.propose.push(call);
    return { cards, model: "fake-propose", usage };
  };
  const review: ReviewGenerator = async (call) => {
    const answer = input.review[seen.review.length];
    seen.review.push(call);
    return { review: answer, model: "fake-review", usage };
  };
  const deps: PipelineDeps = {
    analyze,
    propose,
    review,
    onPhase: async (phase, attempt) => {
      seen.phases.push([phase, attempt]);
    },
    assertAlive: async () => {},
    setBrief: async (brief) => {
      seen.briefs.push(brief);
    },
  };
  return { deps, seen };
}

const keep = (...names: string[]) =>
  names.map((name) => ({ name, verdict: "keep" as const }));

/** The widths per row of the workspace's dashboard, row order. */
async function rowWidths(workspace: string): Promise<number[][]> {
  const dashboard = await caller.dashboard.byWorkspace({
    workspaceId: workspace,
  });
  const rows = new Map<number, number[]>();
  for (const widget of dashboard?.widgets ?? []) {
    rows.set(widget.row, [...(rows.get(widget.row) ?? []), widget.column]);
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, w]) => w);
}

describe.skipIf(!dbUp)("the pipeline (service, fakes)", () => {
  const run = (deps: PipelineDeps) =>
    dashboardGenerationPipelineService.run(
      { workspaceId, spreadsheetId: sheetId },
      deps,
    );

  it("analyzes, proposes, drops what the engine and the reviewer reject, retries with the mistakes fed back and applies the passing attempt", async () => {
    const reason = "The cost question has no card";
    const { deps, seen } = fakes({
      propose: [
        [
          GOOD.revenue,
          BAD.sumOfYears,
          GOOD.orders,
          BAD.pieByOrder,
          GOOD.byRegion,
          GOOD.costByStatus,
          { ...GOOD.costByStatus, name: "Cost by status again" },
          BAD.bogus,
        ],
        [GOOD.revenue, GOOD.orders, GOOD.byRegion, GOOD.costByStatus],
      ],
      review: [
        {
          pass: false,
          reasons: [reason],
          cards: keep(
            "Total revenue",
            "Orders",
            "Revenue by region",
            "Cost by status",
          ),
        },
        {
          pass: true,
          reasons: [],
          cards: keep(
            "Total revenue",
            "Orders",
            "Revenue by region",
            "Cost by status",
          ),
        },
      ],
    });
    const outcome = await run(deps);

    expect(outcome.result).toEqual({
      applied: true,
      attempts: 2,
      reason: "ok",
      cardCount: 4,
      issues: [],
      review: {
        pass: true,
        reasons: [],
        cards: keep(
          "Total revenue",
          "Orders",
          "Revenue by region",
          "Cost by status",
        ),
      },
    });
    expect(outcome.model).toBe("fake-review");
    // One analyze, two proposals, two reviews.
    expect(outcome.usage).toEqual({
      inputTokens: 5,
      outputTokens: 10,
      totalTokens: 15,
    });

    // The brief, with the unknown column dropped, was stored before proposing.
    expect(seen.briefs).toEqual([
      {
        ...BRIEF,
        columns: BRIEF.columns.filter((column) => column.name !== "Ghost"),
      },
    ]);
    const analyze = seen.analyze[0] as Call;
    expect(analyze.system).toContain("<column-profile>");
    expect(analyze.system).toContain("- Order ID (number, identifier)");
    expect(analyze.system).toContain("- Year (number, year)");
    expect(analyze.prompt).toContain('"subject"');

    // The second proposal is told what was wrong with the first.
    expect(seen.propose).toHaveLength(2);
    const [first, second] = seen.propose as [Call, Call];
    expect(first.system).toContain("<brief>");
    expect(first.system).toContain("Subject: one row is one customer order");
    expect(first.system).not.toContain("<previous-attempt>");
    expect(second.system).toContain("<previous-attempt>");
    for (const code of [
      "NON_MEASURE_AGGREGATE",
      "TOO_MANY_SLICES",
      "DUPLICATE_CARD",
      "UNPARSABLE",
    ]) {
      expect(second.system).toContain(code);
    }
    expect(second.system).toContain('"Bogus" unknown/unknown');
    expect(second.system).toContain(reason);
    expect(second.prompt).toContain("second and last attempt");

    // The reviewer saw the surviving cards with their computed rows.
    expect(seen.review).toHaveLength(2);
    const review = seen.review[0] as Call;
    expect(review.system).toContain("<brief>");
    expect(review.prompt).toContain("<cards>");
    const cardsBlock = review.prompt.slice(
      review.prompt.indexOf("<cards>"),
      review.prompt.indexOf("</cards>"),
    );
    expect(cardsBlock).toContain('"Total revenue"');
    expect(cardsBlock).toContain('"Cost by status"');
    expect(cardsBlock).not.toContain('"Sum of years"');
    expect(cardsBlock).not.toContain('"Cost by status again"');
    expect(review.prompt).toContain("- row 0: 6 + 6 = 12");
    expect(review.prompt).toContain("NON_MEASURE_AGGREGATE");

    expect(seen.phases).toEqual([
      ["analyzing", 0],
      ["proposing", 1],
      ["laying_out", 1],
      ["verifying", 1],
      ["retrying", 2],
      ["proposing", 2],
      ["laying_out", 2],
      ["verifying", 2],
      ["applying", 2],
    ]);

    // Applied: four cards in full rows, each row summing to 12.
    const dashboard = await caller.dashboard.byWorkspace({ workspaceId });
    expect(dashboard?.widgets.map((widget) => widget.name).sort()).toEqual([
      "Cost by status",
      "Orders",
      "Revenue by region",
      "Total revenue",
    ]);
    expect(
      dashboard?.widgets.every((widget) => widget.spreadsheetId === sheetId),
    ).toBe(true);
    const widths = await rowWidths(workspaceId);
    expect(widths).toHaveLength(2);
    for (const row of widths) {
      expect(row.reduce((sum, width) => sum + width, 0)).toBe(12);
    }
  });

  it("applies the attempt with the most cards when the reviewer fails both", async () => {
    const second = [
      { ...GOOD.revenue, name: "Second revenue" },
      { ...GOOD.orders, name: "Second orders" },
      { ...GOOD.byRegion, name: "Second by region" },
      { ...GOOD.costByStatus, name: "Second cost" },
    ];
    const { deps, seen } = fakes({
      propose: [
        [GOOD.revenue, GOOD.orders, GOOD.byRegion, GOOD.costByStatus],
        second,
      ],
      review: [
        { pass: false, reasons: ["Too flat"], cards: keep("Total revenue") },
        {
          pass: false,
          reasons: ["Still flat"],
          cards: [
            ...keep("Second revenue", "Second orders", "Second by region"),
            { name: "Second cost", verdict: "drop", note: "no one asked" },
          ],
        },
      ],
    });
    const outcome = await run(deps);
    expect(outcome.result).toMatchObject({
      applied: true,
      attempts: 2,
      reason: "ok",
      cardCount: 4,
      review: { pass: false, reasons: ["Too flat"] },
    });
    expect(seen.phases.at(-1)).toEqual(["applying", 1]);
    // The retry was told about the dropped card.
    expect((seen.propose[1] as Call).system).not.toContain("drop this card");
    const dashboard = await caller.dashboard.byWorkspace({ workspaceId });
    expect(dashboard?.widgets.map((widget) => widget.name).sort()).toEqual([
      "Cost by status",
      "Orders",
      "Revenue by region",
      "Total revenue",
    ]);
  });

  it("leaves the dashboard alone when no card survives either attempt (no_value)", async () => {
    await caller.dashboard.remove({ workspaceId });
    const invalid = [BAD.sumOfYears, BAD.pieByOrder, BAD.bogus];
    const { deps, seen } = fakes({ propose: [invalid, invalid], review: [] });
    const outcome = await run(deps);
    expect(outcome.result).toMatchObject({
      cardCount: 0,
      applied: false,
      attempts: 2,
      reason: "no_value",
      review: null,
    });
    expect(outcome.result.issues.map((issue) => issue.code).sort()).toEqual([
      "NON_MEASURE_AGGREGATE",
      "TOO_MANY_SLICES",
      "UNPARSABLE",
    ]);
    // Nothing reached the reviewer; nothing was applied.
    expect(seen.review).toEqual([]);
    expect(seen.phases.map(([phase]) => phase)).not.toContain("applying");
    expect(seen.phases).toHaveLength(8);
    expect(await caller.dashboard.byWorkspace({ workspaceId })).toBeNull();
  });

  it("fails when the brief cannot be read", async () => {
    const { deps, seen } = fakes({
      brief: { subject: "", questions: [] },
      propose: [],
      review: [],
    });
    const error = await expectError(run(deps), DashboardBriefUnusableError);
    expect(error.name).toBe("DashboardBriefUnusable");
    expect(seen.phases).toEqual([["analyzing", 0]]);
    expect(seen.propose).toEqual([]);
    expect(await caller.dashboard.byWorkspace({ workspaceId })).toBeNull();
  });
});

/* ------------------------------------------------ pure, no key, no database */

describe("the prompts", () => {
  const profile: ColumnProfile[] = [
    {
      name: "Region",
      type: "string",
      role: "category",
      rows: 3,
      filled: 3,
      blank: 0,
      distinct: 2,
      topValues: [
        { value: "EMEA", count: 2 },
        { value: "APAC", count: 1 },
      ],
    },
  ];
  const context = {
    scope: "dashboard" as const,
    workspaceName: "Acme",
    sheet: {
      name: "Orders",
      storedRows: 3,
      description: "One row per order.",
      purpose: "Orders",
    },
    columns: [{ name: "Region", type: "string", node: null }],
    sampleRows: [{ index: 0, cells: [{ name: "Region", value: "EMEA" }] }],
    profile,
    profiledRows: 3,
    dashboard: null,
  };
  const brief: DashboardBrief = {
    subject: "one customer order",
    questions: ["Where does revenue come from?", "How many orders?"],
    columns: [
      { name: "Region", use: "category", note: "three regions" },
      { name: "Revenue", use: "measure" },
    ],
  };
  const issue: VerifyIssue = {
    code: "NON_MEASURE_AGGREGATE",
    severity: "error",
    cardIndex: 1,
    cardName: "Sum of years",
    message: "SUM over a year column",
    detail: "Year",
  };
  const feedback: ProposalFeedback = {
    previousCards: [
      {
        name: "Orders",
        type: "stat",
        variant: "default",
        column: 6,
        query: { a: 1 },
      },
      {
        name: "Sum of years",
        type: "stat",
        variant: "default",
        column: 6,
        query: {},
      },
    ],
    issues: [issue],
    layout: ["row 0: 6 = 6", "row 0 fills 6 of 12 columns"],
    reviewReasons: ["Nothing about cost"],
    dropped: ["Orders"],
  };

  it("describes the brief as a tagged block", () => {
    expect(describeBrief(brief)).toBe(
      [
        "<brief>",
        "Subject: one row is one customer order",
        "Questions, most valuable first:",
        "1. Where does revenue come from?",
        "2. How many orders?",
        "Columns:",
        "- Region: category — three regions",
        "- Revenue: measure",
        "</brief>",
      ].join("\n"),
    );
  });

  it("builds the analyze prompt from the data blocks and asks for the brief's JSON", () => {
    const { system, prompt } = buildAnalyzePrompt(context);
    expect(system).toContain(UNTRUSTED_DATA_RULE);
    expect(system).toContain(
      "<sheet-description>\nLabel: Orders\nDescription: One row per order.\n</sheet-description>",
    );
    expect(system).toContain("<columns>\n- Region (string)\n</columns>");
    expect(system).toContain("- Region (string, category): 3 filled");
    expect(system).not.toContain(WIDGET_GRAMMAR);
    expect(prompt).toContain('"subject": string, "questions": string[]');
    expect(prompt).toContain("Answer with the JSON only.");
  });

  it("builds the propose prompt with the grammar, the rules and the brief; the previous attempt only on a retry", () => {
    const first = buildProposePrompt(context, brief, null);
    expect(first.system).toContain(UNTRUSTED_DATA_RULE);
    expect(first.system).toContain(WIDGET_GRAMMAR);
    expect(first.system).toContain(CHART_SENSE_RULES);
    expect(first.system).toContain(describeBrief(brief));
    expect(first.system).not.toContain("<previous-attempt>");
    expect(first.prompt).toContain(`Propose at most ${MAX_CARDS} cards.`);
    expect(first.prompt).not.toContain("second and last attempt");

    const retry = buildProposePrompt(context, brief, feedback);
    expect(retry.system).toContain("<previous-attempt>");
    expect(retry.system).toContain("</previous-attempt>");
    expect(retry.system).toContain(
      '- "Orders" stat/default width 6; query {"a":1}\n  the reviewer said to drop this card',
    );
    expect(retry.system).toContain(
      "error: NON_MEASURE_AGGREGATE — SUM over a year column (Year)",
    );
    expect(retry.system).toContain("- row 0 fills 6 of 12 columns");
    expect(retry.system).toContain(
      "The reviewer's reasons:\n- Nothing about cost",
    );
    expect(retry.prompt).toContain("second and last attempt");
  });

  it("builds the review prompt with the brief, the cards and their rows, the findings and the layout", () => {
    const { system, prompt } = buildReviewPrompt(
      brief,
      [
        {
          name: "Orders",
          description: "How many",
          type: "stat",
          variant: "default",
          column: 6,
          row: 0,
          query: { series: [] },
          rows: [{ n: 24 }, { n: 25 }, { n: 26 }, { n: 27 }],
        },
      ],
      [issue],
      ["row 0: 6 + 6 = 12"],
    );
    expect(system).toContain(UNTRUSTED_DATA_RULE);
    expect(system).toContain(describeBrief(brief));
    expect(prompt).toContain(
      '<cards>\n- "Orders" (How many) stat/default, width 6, row 0; query {"series":[]}; first computed rows: {"n":24}; {"n":25}; {"n":26}\n</cards>',
    );
    expect(prompt).toContain(
      'Automatic checks already found:\n- card 1 "Sum of years": error NON_MEASURE_AGGREGATE — SUM over a year column',
    );
    expect(prompt).toContain("- row 0: 6 + 6 = 12");
    expect(prompt).toContain('"pass": boolean');

    const empty = buildReviewPrompt(brief, [], [], []);
    expect(empty.prompt).toContain("(no cards survived the checks)");
    expect(empty.prompt).toContain("Automatic checks already found:\n(none)");
    expect(empty.prompt).toContain("(empty)");
  });
});

describe("the pipeline helpers", () => {
  const columns = [{ name: "Region" }, { name: "Revenue" }];

  it("parses the brief strictly and drops columns the sheet does not have", () => {
    expect(
      parseBrief(
        {
          subject: " one order ",
          questions: ["Q"],
          columns: [
            { name: "region", use: "category" },
            { name: "Ghost", use: "noise" },
          ],
        },
        columns,
      ),
    ).toEqual({
      subject: "one order",
      questions: ["Q"],
      columns: [{ name: "region", use: "category" }],
    });
    expect(() =>
      parseBrief({ subject: "x", questions: [], columns: [] }, columns),
    ).toThrow(DashboardBriefUnusableError);
    expect(() => parseBrief(null, columns)).toThrow(
      DashboardBriefUnusableError,
    );
  });

  it("normalises a raw card with its defaults, by type, or rejects it", () => {
    expect(
      toGenerationCard({
        name: "Orders",
        type: "stat",
        query: { series: [{ key: "n", label: "N", formula: "COUNT()" }] },
      }),
    ).toEqual({
      name: "Orders",
      description: null,
      type: "stat",
      variant: "default",
      height: "sm",
      column: 3,
      query: {
        filters: [],
        groupBy: null,
        series: [{ key: "n", label: "N", formula: "COUNT()" }],
      },
    });
    expect(
      toGenerationCard({
        name: "Rows",
        type: "table",
        query: { series: [{ key: "r", label: "R", formula: "{Region}" }] },
      })?.column,
    ).toBe(12);
    expect(
      toGenerationCard({
        name: "By region",
        description: "Where",
        type: "bar",
        variant: "horizontal",
        height: "lg",
        column: 12,
        query: {
          groupBy: { column: "Region" },
          series: [{ key: "r", label: "R", formula: "SUM({Revenue})" }],
          limit: 5,
        },
      }),
    ).toEqual({
      name: "By region",
      description: "Where",
      type: "bar",
      variant: "horizontal",
      height: "lg",
      column: 12,
      query: {
        filters: [],
        groupBy: { column: "Region", bucket: "none" },
        series: [{ key: "r", label: "R", formula: "SUM({Revenue})" }],
        limit: 5,
      },
    });
    expect(
      toGenerationCard({ name: "", type: "stat", query: { series: [] } }),
    ).toBeNull();
    expect(
      toGenerationCard({ name: "X", type: "bogus", query: { series: [] } }),
    ).toBeNull();
    expect(
      toGenerationCard({
        name: "Bad key",
        type: "stat",
        query: {
          series: [{ key: "total fees", label: "T", formula: "COUNT()" }],
        },
      }),
    ).toBeNull();
    expect(toGenerationCard("nope")).toBeNull();
  });

  it("keeps real units, drops invented ones, and unsplits a self-split", () => {
    const card = toGenerationCard({
      name: "Top customers",
      type: "table",
      query: {
        groupBy: { column: "Customer" },
        splitBy: { column: "customer " },
        series: [
          {
            key: "rev",
            label: "Revenue",
            formula: "SUM({Revenue})",
            prefix: "€",
            suffix: "वरुन",
          },
          {
            key: "share",
            label: "Share",
            formula: "AVG({Units})",
            suffix: "%",
          },
          { key: "n", label: "N", formula: "COUNT()", prefix: "orders!" },
        ],
      },
    });
    expect(card?.query.splitBy).toBeUndefined();
    expect(card?.query.series).toEqual([
      { key: "rev", label: "Revenue", formula: "SUM({Revenue})", prefix: "€" },
      { key: "share", label: "Share", formula: "AVG({Units})", suffix: "%" },
      { key: "n", label: "N", formula: "COUNT()" },
    ]);
    expect(unitOrNothing("$")).toBe("$");
    expect(unitOrNothing(" kg ")).toBe("kg");
    expect(unitOrNothing("US$")).toBeUndefined();
    expect(unitOrNothing("₹")).toBe("₹");
  });

  it("reads the review strictly and fails an unreadable one", () => {
    const review = {
      pass: true,
      reasons: [],
      cards: [{ name: "A", verdict: "keep" as const }],
    };
    expect(parseReview(review)).toEqual(review);
    expect(parseReview({ pass: "yes" })).toEqual({
      pass: false,
      reasons: ["The reviewer's answer could not be read"],
      cards: [],
    });
    expect(parseReview(undefined).pass).toBe(false);
  });

  it("describes the packed layout row by row, with what is under-filled", () => {
    const card = (row: number, sort: number, column: number) =>
      ({
        row,
        sort,
        column,
        name: "c",
        description: null,
        type: "stat" as const,
        variant: "default",
        height: "md" as const,
        query: { filters: [], groupBy: null, series: [] },
      }) as Parameters<typeof describeLayout>[0][number];
    expect(
      describeLayout([card(0, 0, 6), card(0, 1, 6), card(1, 0, 6)]),
    ).toEqual([
      "row 0: 6 + 6 = 12",
      "row 1: 6 = 6",
      "row 1 fills 6 of 12 columns",
    ]);
    expect(describeLayout([])).toEqual([]);
  });

  it("picks the passing attempt, else the most cards, then the fewest warnings", () => {
    type Attempt = Parameters<typeof pickBest>[0][number];
    const attempt = (over: Partial<Attempt>): Attempt => ({
      attempt: 1,
      cards: [],
      issues: [],
      review: null,
      warnings: 0,
      passed: false,
      ...over,
    });
    const card = {} as Attempt["cards"][number];
    const passing = attempt({ attempt: 2, cards: [card], passed: true });
    expect(pickBest([attempt({ cards: [card, card, card] }), passing])).toBe(
      passing,
    );

    const three = attempt({
      attempt: 1,
      cards: [card, card, card],
      warnings: 2,
    });
    const four = attempt({
      attempt: 2,
      cards: [card, card, card, card],
      warnings: 5,
    });
    expect(pickBest([three, four])).toBe(four);
    expect(pickBest([four, three])).toBe(four);

    const quiet = attempt({
      attempt: 2,
      cards: [card, card, card],
      warnings: 0,
    });
    expect(pickBest([three, quiet])).toBe(quiet);
    expect(pickBest([quiet, three])).toBe(quiet);
    expect(() => pickBest([])).toThrow();
  });

  it("states the caps the worker obeys", () => {
    expect(MIN_CARDS).toBe(3);
    expect(MAX_CARDS).toBe(8);
    expect(MAX_ATTEMPTS).toBe(2);
  });
});
