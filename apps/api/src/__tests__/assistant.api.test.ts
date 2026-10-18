/**
 * CONTRACT — assistant
 * Feature doc: docs/features/assistant.md · Rules: docs/rules/TESTING.md
 *
 * TABLE `AssistantRun`
 *   id             String           pk, uuid
 *   workspaceId    String           fk cascade → Workspace; indexed with updatedAt
 *   spreadsheetId  String?          fk cascade → Spreadsheet (the workspace's sheet, resolved at start)
 *   scope          AssistantScope   DASHBOARD | SPREADSHEET
 *   source         AssistantSource  USER | SYSTEM, default USER
 *   prompt         String           ≤ 2000
 *   status         String           uppercase; PENDING | THINKING | WORKING | AWAITING_CONFIRMATION |
 *                                   COMPLETED | FAILED | CANCELLED; the last three are terminal
 *   steps          Json             AssistantStep[] (default [])
 *   pendingAction  Json?            the delete waiting for the user, while AWAITING_CONFIRMATION
 *   summary        String?          the model's closing message (≤ 2000)
 *   error          Json?            { name, message }
 *   model          String?          the model id that answered
 *   usage          Json?            { inputTokens, outputTokens, totalTokens }, every step summed
 *   transcript     Json?            the model conversation — audit only, NEVER on the wire
 *   triggerRunId   String?          the Trigger.dev run id — cancel's handle, never on the wire
 *   createdAt      DateTime         now(), indexed
 *   updatedAt      DateTime         @updatedAt; its ms value is the SSE event id
 *   Partial unique index `AssistantRun_active_workspace_key` (workspaceId WHERE status
 *   NOT IN terminal): one active run per workspace. Trigger `assistant_run_notify`
 *   publishes every insert/update id on channel `assistant_run_changed`.
 *
 * MODEL  AssistantRun = {
 *   id: string; workspaceId: string; spreadsheetId: string | null;
 *   scope: "dashboard" | "spreadsheet"; source: "user" | "system"; prompt: string;
 *   status: "pending" | "thinking" | "working" | "awaiting_confirmation" | "completed" | "failed" | "cancelled";
 *   steps: AssistantStep[]; pendingAction: PendingAction | null;
 *   summary: string | null; error: { name: string; message: string } | null;
 *   model: string | null; usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
 *   createdAt: Date; updatedAt: Date;
 * }
 * AssistantStep = {                       // one tool call, in call order
 *   index: number; tool: AssistantToolName;
 *   input: Record<string, unknown>;       // SUMMARISED: identifiers and counts, never cell lists (see below)
 *   status: "running" | "done" | "failed" | "declined"; mutated: boolean;  // mutated: the sheet/dashboard changed
 *   summary: string | null;               // reserved, null today
 *   error: string | null;                 // "<CODE>: <message>" when failed — what the model was told
 *   startedAt: string; finishedAt: string | null;  // ISO timestamps (they live in JSON)
 * }
 * PendingAction = {                       // set while status is awaiting_confirmation
 *   stepIndex: number; tool: "removeColumn" | "removeRows" | "removeWidget";
 *   input: Record<string, unknown>;       // the summarised input plus what the confirmation shows (count, name)
 *   tokenId: string; requestedAt: string;
 *   response: { approved: boolean; at: string } | null;  // set by respond; the worker clears the whole action
 * }
 * AssistantToolName — spreadsheet scope: readRows getColumnSummary createColumn updateColumn
 *   reorderColumn setCells fillColumn appendRows removeColumn* removeRows*;
 *   dashboard scope: readRows getColumnSummary createWidget updateWidget updateDashboard removeWidget*.
 *   (* = destructive: pauses the run for a confirmation.)
 * Summarised step inputs (what `steps[].input` and `pendingAction.input` hold):
 *   readRows { startRow, limit } · getColumnSummary { column } · createColumn { name, type }
 *   updateColumn { column, name?, type? } · reorderColumn { column, position }
 *   setCells { column, count } · fillColumn { column, value, where?, count } · appendRows { count }
 *   removeColumn { column, count } · removeRows { count, where? }
 *   createWidget / updateWidget / removeWidget { id?, name?, type? } · updateDashboard { title?, description? }
 * AssistantChange =
 *   | { type: "snapshot"; run: AssistantRun | null }   // the workspace's active run, on (re)connect
 *   | { type: "run"; run: AssistantRun }               // one run after an insert or update
 *   | { type: "closed" }                               // the run finished and nothing is active; last event
 * AssistantTranscription = { text: string; languageCode: string | null }
 * AssistantRecommendation = { name; description: string | null; type; variant; height;
 *   column: 1..12; query: WidgetQuery }   // a dashboard WidgetInput without its slot
 * AssistantRecommendations = { spreadsheetId: string; recommendations: AssistantRecommendation[] (≤ 6);
 *   skipped: number; model: string; usage: { inputTokens, outputTokens, totalTokens } }
 * Dates cross the wire as real Date objects (superjson). Status, scope and
 * source are lowercase on the wire and uppercase in the database.
 *
 * PROCEDURES
 * | Procedure                 | Kind         | Payload                                              | Response                        | Errors                                                   |
 * | ------------------------- | ------------ | ---------------------------------------------------- | ------------------------------- | -------------------------------------------------------- |
 * | assistant.start           | mutation     | { workspaceId; scope; prompt: 1..2000 }              | AssistantRun (pending)          | BAD_REQUEST, NOT_FOUND, CONFLICT, BAD_GATEWAY            |
 * | assistant.byId            | query        | { id }                                               | AssistantRun                    | BAD_REQUEST, NOT_FOUND                                   |
 * | assistant.active          | query        | { workspaceId }                                      | AssistantRun | null             | BAD_REQUEST                                              |
 * | assistant.cancel          | mutation     | { id }                                               | AssistantRun (cancelled)        | BAD_REQUEST, NOT_FOUND, CONFLICT                         |
 * | assistant.respond         | mutation     | { id; approved: boolean }                            | AssistantRun                    | BAD_REQUEST, NOT_FOUND, CONFLICT                         |
 * | assistant.onChange        | subscription | { workspaceId; lastEventId? }                        | SSE of tracked AssistantChange  | BAD_REQUEST                                              |
 * | assistant.recommendWidgets| mutation     | { workspaceId }                                      | AssistantRecommendations        | BAD_REQUEST, NOT_FOUND, SERVICE_UNAVAILABLE, BAD_GATEWAY |
 * | POST /assistant/transcribe| REST         | multipart "file": an audio recording ≤ 10 MB         | 200 AssistantTranscription      | 400, 502, 503                                            |
 *
 * NOTES
 * - `start` records one run `pending` for the workspace's own sheet and asks
 *   the Trigger.dev worker to execute it. An unknown workspace is NOT_FOUND
 *   (`WORKSPACE_NOT_FOUND`); a workspace without a sheet is NOT_FOUND
 *   (`SPREADSHEET_NOT_FOUND`). One active run per workspace: a second `start`
 *   while one is pending / thinking / working / awaiting_confirmation is
 *   CONFLICT (`ASSISTANT_BUSY`); once it is completed / failed / cancelled the
 *   next one starts. When the worker cannot be reached the row is flipped to
 *   `failed` with `error: { name, message }` and the call is BAD_GATEWAY
 *   (`ASSISTANT_DISPATCH_FAILED`). With no worker registered (tests, an api
 *   started without `TRIGGER_SECRET_KEY`'s dispatcher) the run stays pending.
 *   The tRPC `start` is always `source: "user"`; in-process callers
 *   (onboarding) pass `source: "system"` to `assistantControlService.start`.
 * - The worker (`src/trigger/assistant-run.ts`) moves the run `thinking`
 *   before each model call and `working` while it executes a tool call: each
 *   call is appended to `steps` as `running`, executed one at a time through
 *   the spreadsheet / dashboard services, then closed as `done`, `failed`
 *   (the model is told the error and may correct it) or `declined`. A text
 *   answer `complete`s the run with `summary`; `failed` records the reason
 *   (`error.name` "AssistantStepLimit" after 12 model steps, "AssistantNoSheet"
 *   when the sheet is gone). Caps: 12 model steps, 20 tool calls, 2,000 cell
 *   writes per run; 500 cells per setCells, 100 rows per appendRows, 1,000
 *   rows per removeRows, 50 rows per readRows.
 * - A destructive tool call (removeColumn, removeRows, removeWidget) never
 *   runs unasked: the run goes `awaiting_confirmation` with `pendingAction`
 *   describing it (the column and how many values it holds, the row count,
 *   the card's name) and the worker suspends on a Trigger.dev waitpoint token.
 *   `respond` records `pendingAction.response` and completes the token; the
 *   status stays `awaiting_confirmation` until the worker resumes and closes
 *   the step (`done` after an approval, `declined` after a refusal — the model
 *   is told and goes on). `respond` on a run that is not awaiting, already
 *   answered, or whose token the worker no longer holds is CONFLICT
 *   (`ASSISTANT_NOT_AWAITING`). Unanswered for 10 minutes, the worker cancels
 *   the run with `error.name` "AssistantConfirmationTimeoutError".
 * - `cancel` flips the row to `cancelled` first (its `pendingAction` is
 *   cleared) and then tells the worker, best effort; the worker also re-reads
 *   the row between steps and stops on a cancelled one. A finished run is
 *   CONFLICT (`ASSISTANT_FINISHED`). Everything a cancelled run already wrote
 *   stays written (each tool call is its own transaction) and is listed in
 *   `steps`.
 * - `active` is the one run that is not terminal, or null — what the capsule
 *   checks on page load before subscribing.
 * - The stream is a generation, not a socket. `onChange` streams one
 *   workspace: with `lastEventId` it first replays every run whose
 *   `updatedAt >= lastEventId` (oldest first, at most 100), then sends a
 *   `snapshot` (the active run or null), then a `run` event per change as it
 *   happens; when a terminal `run` event leaves the workspace with no active
 *   run it sends `{ type: "closed" }` as the last event and ends. Event ids
 *   are `String(run.updatedAt.getTime())`; a `snapshot`'s id is the
 *   workspace's newest `updatedAt` ("0" when it has no runs). tRPC re-sends the
 *   last id on reconnect, so a client must apply events idempotently. Pings
 *   every 15 s; a client that hears nothing for 45 s reconnects. A client must
 *   stop subscribing on `closed`.
 * - `POST /assistant/transcribe` takes one multipart field `file` — the
 *   capsule's recording (`audio/*`, or a `video/webm` / `video/mp4` container
 *   an audio-only MediaRecorder may label it with), at most 10 MB — and
 *   answers the ElevenLabs transcript as `{ text, languageCode }`. Nothing is
 *   stored. No `file` field, a non-audio type or an oversized recording is 400
 *   (`ASSISTANT_TRANSCRIPTION_INVALID` for the last two); without an
 *   `ELEVENLABS_API_KEY` on the api it is 503
 *   (`ASSISTANT_TRANSCRIPTION_UNAVAILABLE`); an upstream failure is 502
 *   (`ASSISTANT_TRANSCRIPTION_FAILED`). Error bodies are `{ code, message }`.
 * - `recommendWidgets` is one synchronous model call, no run row: the
 *   workspace's sheet is profiled (the first 2,000 rows: fill, cardinality, a
 *   role per column — identifier, year, time, flag, category, measure, text)
 *   and the model answers with cards as JSON. Each card is then parsed
 *   against the dashboard contract, validated with the engine against the
 *   sheet's columns and dropped when it fails, dropped when it repeats a card
 *   the dashboard already has (same type and query), and the first 6 are
 *   answered with their defaults filled (`variant` "default", `height` "md",
 *   `column` by type: stat 3, table 12, else 6); `skipped` counts the rest.
 *   A recommendation has no `row` / `sort`: `dashboard.createWidget` places
 *   it. An unknown workspace or one without a sheet is NOT_FOUND; without a
 *   `GOOGLE_GENERATIVE_AI_API_KEY` on the api it is SERVICE_UNAVAILABLE
 *   (`ASSISTANT_RECOMMENDATIONS_UNAVAILABLE`); a model failure is BAD_GATEWAY
 *   (`ASSISTANT_RECOMMENDATIONS_FAILED`).
 * - Every procedure is public; there is no auth yet.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { ColumnProfile } from "@reclit/dashboard-engine";
import {
  buildAssistantSystemPrompt,
  buildRecommendationPrompt,
  CHART_SENSE_RULES,
  MAX_SAMPLE_ROWS,
  truncateValue,
  UNTRUSTED_DATA_RULE,
  WIDGET_GRAMMAR,
} from "../ai/assistant-prompt";
import type { RecommendationGenerator } from "../ai/assistant-recommend";
import {
  addUsage,
  toolResultsMessage,
  toUsage,
  trimTranscript,
} from "../ai/assistant-step";
import { pingDatabase, prisma } from "../db/prisma";
import {
  AssistantFinishedError,
  AssistantNotAwaitingError,
  AssistantRecommendationsFailedError,
} from "../modules/assistant/assistant.errors";
import { assistantFeed } from "../modules/assistant/assistant.feed";
import type {
  AssistantChange,
  AssistantRun,
  AssistantStep,
  AssistantToolName,
  StartAssistantInput,
} from "../modules/assistant/assistant.schema";
import {
  ASSISTANT_DASHBOARD_TOOLS,
  ASSISTANT_DESTRUCTIVE_TOOLS,
  ASSISTANT_SPREADSHEET_TOOLS,
  isDestructiveTool,
  MAX_ASSISTANT_SUMMARY,
  toolsForScope as toolNamesForScope,
} from "../modules/assistant/assistant.schema";
import { assistantService } from "../modules/assistant/assistant.service";
import { assistantControlService } from "../modules/assistant/assistant-control.service";
import { toWidgetQueryInput } from "../modules/assistant/assistant-dashboard-tools";
import {
  AssistantExecutor,
  type ConfirmationOutcome,
} from "../modules/assistant/assistant-executor";
import { assistantRecommendService } from "../modules/assistant/assistant-recommend.service";
import {
  coerceToolValue,
  resolveColumn,
  selectRowIndexes,
  summariseColumn,
  toWidgetFilter,
} from "../modules/assistant/assistant-sheet";
import {
  ToolBudget,
  ToolInputError,
} from "../modules/assistant/assistant-tool-runtime";
import {
  ASSISTANT_TOOLS,
  defaultWidgetSpan,
  summariseStepInput,
  toolsForScope,
} from "../modules/assistant/assistant-tools";
import type { SheetPayload } from "../modules/spreadsheet/spreadsheet.schema";
import {
  makeIsolatedOwnerWorkspace,
  makeWorkspace,
  removeUser,
  removeWorkspace,
} from "./support/fixtures";
import { startTestServer } from "./support/http";
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

// One workspace with a small sheet: three columns, three rows. The executor
// suite edits it; everything else only starts and cancels runs on it.
let workspaceId = "";
let sheetId = "";
let nameColumn = 0;
let feesColumn = 0;
let countryColumn = 0;

const PROMPT = "Rename the Fees column to Tuition";

async function startRun(over: Partial<StartAssistantInput> = {}) {
  return caller.assistant.start({
    workspaceId,
    scope: "spreadsheet",
    prompt: PROMPT,
    ...over,
  });
}

/** Ends a run so the next test can start one (the index allows one at a time). */
async function finish(id: string): Promise<void> {
  await assistantService.cancel(id).catch(() => {});
}

/** Runs `body` with a fresh pending run and always ends it. */
async function withRun(
  body: (run: AssistantRun) => Promise<void>,
  over: Partial<StartAssistantInput> = {},
): Promise<void> {
  const run = await startRun(over);
  try {
    await body(run);
  } finally {
    await finish(run.id);
  }
}

/** A dispatcher that records what the api asked of the worker. */
function recordingDispatcher(options: { tokenSuccess?: boolean } = {}) {
  const calls = {
    trigger: [] as string[],
    cancel: [] as string[],
    tokens: [] as { tokenId: string; approved: boolean }[],
  };
  assistantControlService.setDispatcher({
    trigger: async (run) => {
      calls.trigger.push(run.id);
      return { id: `run_${run.id}` };
    },
    cancel: async (triggerRunId) => {
      calls.cancel.push(triggerRunId);
    },
    completeToken: async (tokenId, data) => {
      calls.tokens.push({ tokenId, approved: data.approved });
      return { success: options.tokenSuccess ?? true };
    },
  });
  return calls;
}

const pendingAction = (over: Partial<AssistantRun["pendingAction"]> = {}) => ({
  stepIndex: 0,
  tool: "removeColumn" as const,
  input: { column: "Fees", count: 3 },
  tokenId: "waitpoint_contract",
  requestedAt: new Date().toISOString(),
  response: null,
  ...over,
});

const runningStep = (tool: AssistantToolName, index = 0): AssistantStep => ({
  index,
  tool,
  input: { column: "Fees" },
  status: "running",
  mutated: false,
  summary: null,
  error: null,
  startedAt: new Date().toISOString(),
  finishedAt: null,
});

beforeAll(async () => {
  if (!dbUp) return;
  const workspace = await makeWorkspace("assistant contract");
  workspaceId = workspace.id;
  sheetId = workspace.spreadsheetId ?? "";
  nameColumn = (
    await caller.spreadsheet.createColumn({ id: sheetId, name: "Name" })
  ).index;
  feesColumn = (
    await caller.spreadsheet.createColumn({
      id: sheetId,
      name: "Fees",
      type: "number",
    })
  ).index;
  countryColumn = (
    await caller.spreadsheet.createColumn({ id: sheetId, name: "Country" })
  ).index;
  const rows: [string, number, string | null][] = [
    ["Ada", 100, "US"],
    ["Bob", 250, null],
    ["Cy", 50, null],
  ];
  for (const [rowIndex, [name, fees, country]] of rows.entries()) {
    await caller.spreadsheet.updateRow({
      id: sheetId,
      rowIndex,
      cells: [
        { columnIndex: nameColumn, value: name },
        { columnIndex: feesColumn, value: fees },
        ...(country === null
          ? []
          : [{ columnIndex: countryColumn, value: country }]),
      ],
    });
  }
});

afterAll(async () => {
  assistantControlService.setDispatcher(null);
  await assistantFeed.stop();
  if (workspaceId) {
    await prisma.assistantRun
      .deleteMany({ where: { workspaceId } })
      .catch(() => {});
    await removeWorkspace(workspaceId);
  }
});

describe.skipIf(!dbUp)("assistant.start", () => {
  it("records a pending run for the workspace's sheet with the minimal payload", async () => {
    await withRun(async (run) => {
      expect(run).toMatchObject({
        workspaceId,
        spreadsheetId: sheetId,
        scope: "spreadsheet",
        source: "user",
        prompt: PROMPT,
        status: "pending",
        steps: [],
        pendingAction: null,
        summary: null,
        error: null,
        model: null,
        usage: null,
      });
      expect(typeof run.id).toBe("string");
      expectDate(run.createdAt);
      expectDate(run.updatedAt);
      expect(await caller.assistant.byId({ id: run.id })).toEqual(run);
    });
  });

  it("accepts the dashboard scope and trims the prompt", async () => {
    await withRun(
      async (run) => {
        expect(run.scope).toBe("dashboard");
        expect(run.prompt).toBe("Add a card with the total fees");
      },
      { scope: "dashboard", prompt: "  Add a card with the total fees  " },
    );
  });

  it("rejects a blank prompt, an over-long prompt and an unknown scope (BAD_REQUEST)", async () => {
    await expectTRPCError(startRun({ prompt: "   " }), "BAD_REQUEST");
    await expectTRPCError(
      startRun({ prompt: "x".repeat(2001) }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      startRun({ scope: "settings" as unknown as "dashboard" }),
      "BAD_REQUEST",
    );
    await expectTRPCError(startRun({ workspaceId: "" }), "BAD_REQUEST");
  });

  it("rejects an unknown workspace (NOT_FOUND)", async () => {
    await expectTRPCError(
      startRun({ workspaceId: "00000000-0000-0000-0000-000000000000" }),
      "NOT_FOUND",
    );
  });

  it("rejects a workspace without a sheet (NOT_FOUND)", async () => {
    const isolated = await makeIsolatedOwnerWorkspace();
    try {
      await expectTRPCError(
        startRun({ workspaceId: isolated.workspaceId }),
        "NOT_FOUND",
      );
    } finally {
      await removeUser(isolated.userId);
    }
  });

  it("allows one active run per workspace (CONFLICT), then the next after it ends", async () => {
    const first = await startRun();
    try {
      await expectTRPCError(startRun(), "CONFLICT");
    } finally {
      await caller.assistant.cancel({ id: first.id });
    }
    await withRun(async (second) => {
      expect(second.id).not.toBe(first.id);
      expect(second.status).toBe("pending");
    });
  });

  it("hands the run to the dispatcher and keeps the worker's run id", async () => {
    const calls = recordingDispatcher();
    try {
      await withRun(async (run) => {
        expect(calls.trigger).toEqual([run.id]);
        expect(run.status).toBe("pending");
        const info = await assistantService.controlInfo(run.id);
        expect(info.triggerRunId).toBe(`run_${run.id}`);
      });
    } finally {
      assistantControlService.setDispatcher(null);
    }
  });

  it("fails the run and answers BAD_GATEWAY when the dispatcher throws", async () => {
    assistantControlService.setDispatcher({
      trigger: async () => {
        throw new Error("worker unreachable");
      },
      cancel: async () => {},
      completeToken: async () => ({ success: true }),
    });
    try {
      await expectTRPCError(startRun(), "BAD_GATEWAY");
      const failed = await prisma.assistantRun.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, error: true },
      });
      expect(failed?.status).toBe("FAILED");
      expect(failed?.error).toMatchObject({ message: "worker unreachable" });
    } finally {
      assistantControlService.setDispatcher(null);
    }
    // The failed row is terminal, so the workspace is free again.
    await withRun(async (run) => expect(run.status).toBe("pending"));
  });

  it("an in-process caller may start a run as the system", async () => {
    const run = await assistantControlService.start({
      workspaceId,
      scope: "dashboard",
      prompt: "Build a starter dashboard",
      source: "system",
    });
    try {
      expect(run.source).toBe("system");
      expect((await caller.assistant.byId({ id: run.id })).source).toBe(
        "system",
      );
    } finally {
      await finish(run.id);
    }
  });
});

describe.skipIf(!dbUp)("assistant.byId", () => {
  it("rejects a blank id (BAD_REQUEST) and an unknown id (NOT_FOUND)", async () => {
    await expectTRPCError(caller.assistant.byId({ id: "" }), "BAD_REQUEST");
    await expectTRPCError(
      caller.assistant.byId({ id: "00000000-0000-0000-0000-000000000000" }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("assistant.active", () => {
  it("is null without a run, the run while it is active, null again once it ended", async () => {
    expect(await caller.assistant.active({ workspaceId })).toBeNull();
    const run = await startRun();
    try {
      expect(await caller.assistant.active({ workspaceId })).toMatchObject({
        id: run.id,
        status: "pending",
      });
    } finally {
      await caller.assistant.cancel({ id: run.id });
    }
    expect(await caller.assistant.active({ workspaceId })).toBeNull();
  });

  it("rejects a blank workspaceId (BAD_REQUEST)", async () => {
    await expectTRPCError(
      caller.assistant.active({ workspaceId: "" }),
      "BAD_REQUEST",
    );
  });
});

describe.skipIf(!dbUp)("assistant.cancel", () => {
  it("cancels a pending run, clears the pending action and tells the worker", async () => {
    const calls = recordingDispatcher();
    try {
      const run = await startRun();
      await assistantService.markAwaiting(run.id, pendingAction());
      const cancelled = await caller.assistant.cancel({ id: run.id });
      expect(cancelled).toMatchObject({
        id: run.id,
        status: "cancelled",
        pendingAction: null,
        error: null,
      });
      expect(calls.cancel).toEqual([`run_${run.id}`]);
    } finally {
      assistantControlService.setDispatcher(null);
    }
  });

  it("rejects an unknown id (NOT_FOUND), a blank id (BAD_REQUEST) and a finished run (CONFLICT)", async () => {
    await expectTRPCError(caller.assistant.cancel({ id: "" }), "BAD_REQUEST");
    await expectTRPCError(
      caller.assistant.cancel({ id: "00000000-0000-0000-0000-000000000000" }),
      "NOT_FOUND",
    );
    const run = await startRun();
    await caller.assistant.cancel({ id: run.id });
    await expectTRPCError(caller.assistant.cancel({ id: run.id }), "CONFLICT");
  });
});

describe.skipIf(!dbUp)("assistant.respond", () => {
  it("rejects a run that is not awaiting a confirmation (CONFLICT)", async () => {
    await withRun(async (run) => {
      await expectTRPCError(
        caller.assistant.respond({ id: run.id, approved: true }),
        "CONFLICT",
      );
    });
  });

  it("records the answer on the pending action, completes the token, and takes one answer only", async () => {
    const calls = recordingDispatcher();
    try {
      await withRun(async (run) => {
        await assistantService.markAwaiting(run.id, pendingAction());
        const answered = await caller.assistant.respond({
          id: run.id,
          approved: true,
        });
        expect(answered.status).toBe("awaiting_confirmation");
        expect(answered.pendingAction).toMatchObject({
          tool: "removeColumn",
          input: { column: "Fees", count: 3 },
          tokenId: "waitpoint_contract",
          response: { approved: true },
        });
        expect(typeof answered.pendingAction?.response?.at).toBe("string");
        expect(calls.tokens).toEqual([
          { tokenId: "waitpoint_contract", approved: true },
        ]);
        await expectTRPCError(
          caller.assistant.respond({ id: run.id, approved: false }),
          "CONFLICT",
        );
      });
    } finally {
      assistantControlService.setDispatcher(null);
    }
  });

  it("is CONFLICT when the worker no longer holds the token", async () => {
    recordingDispatcher({ tokenSuccess: false });
    try {
      await withRun(async (run) => {
        await assistantService.markAwaiting(run.id, pendingAction());
        await expectTRPCError(
          caller.assistant.respond({ id: run.id, approved: false }),
          "CONFLICT",
        );
      });
    } finally {
      assistantControlService.setDispatcher(null);
    }
  });

  it("rejects a blank id and a non-boolean answer (BAD_REQUEST), an unknown id (NOT_FOUND)", async () => {
    await expectTRPCError(
      caller.assistant.respond({ id: "", approved: true }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.assistant.respond({
        id: "00000000-0000-0000-0000-000000000000",
        approved: "yes" as unknown as boolean,
      }),
      "BAD_REQUEST",
    );
    await expectTRPCError(
      caller.assistant.respond({
        id: "00000000-0000-0000-0000-000000000000",
        approved: true,
      }),
      "NOT_FOUND",
    );
  });
});

describe.skipIf(!dbUp)("the worker's transitions (service)", () => {
  it("walks thinking → working (step appended) → step closed with its enriched input", async () => {
    await withRun(async (run) => {
      expect((await assistantService.markThinking(run.id)).status).toBe(
        "thinking",
      );
      const working = await assistantService.markWorking(
        run.id,
        runningStep("updateColumn"),
      );
      expect(working.status).toBe("working");
      expect(working.steps).toHaveLength(1);
      expect(working.steps[0]).toMatchObject({
        index: 0,
        tool: "updateColumn",
        status: "running",
        finishedAt: null,
      });
      const closed = await assistantService.finishStep(run.id, 0, {
        status: "done",
        mutated: true,
        input: { column: "Fees", name: "Tuition" },
      });
      expect(closed.steps[0]).toMatchObject({
        status: "done",
        mutated: true,
        input: { column: "Fees", name: "Tuition" },
        error: null,
      });
      expect(typeof closed.steps[0]?.finishedAt).toBe("string");
    });
  });

  it("closing the awaited step clears the pending action; a long summary is clipped; a finished run never moves again", async () => {
    await withRun(async (run) => {
      await assistantService.markWorking(run.id, runningStep("removeColumn"));
      await assistantService.markAwaiting(run.id, pendingAction());
      const resumed = await assistantService.markWorking(run.id);
      expect(resumed.status).toBe("working");
      expect(resumed.pendingAction).not.toBeNull();
      const closed = await assistantService.finishStep(run.id, 0, {
        status: "declined",
        mutated: false,
      });
      expect(closed.pendingAction).toBeNull();
      expect(closed.steps[0]?.status).toBe("declined");

      const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };
      const completed = await assistantService.complete(run.id, {
        summary: "x".repeat(MAX_ASSISTANT_SUMMARY + 500),
        model: "gemini-test",
        usage,
      });
      expect(completed.status).toBe("completed");
      expect(completed.summary?.length).toBe(MAX_ASSISTANT_SUMMARY);
      expect(completed.model).toBe("gemini-test");
      expect(completed.usage).toEqual(usage);

      await expectError(
        assistantService.markThinking(run.id),
        AssistantFinishedError,
      );
      await expectError(
        assistantService.recordResponse(run.id, true),
        AssistantNotAwaitingError,
      );
    });
  });

  it("fail records the error; cancel with a cause records it too", async () => {
    await withRun(async (run) => {
      const failed = await assistantService.fail(run.id, {
        name: "Boom",
        message: "it broke",
      });
      expect(failed).toMatchObject({
        status: "failed",
        error: { name: "Boom", message: "it broke" },
      });
    });
    await withRun(async (run) => {
      const cancelled = await assistantService.cancel(run.id, {
        name: "AssistantConfirmationTimeoutError",
        message: "not answered",
      });
      expect(cancelled).toMatchObject({
        status: "cancelled",
        error: { name: "AssistantConfirmationTimeoutError" },
      });
    });
  });
});

describe.skipIf(!dbUp)("assistant.onChange", () => {
  /** A stream through its own abortable caller. */
  async function openStream(workspace: string, lastEventId?: string) {
    const controller = new AbortController();
    const stream = await callerWithSignal(controller.signal).assistant.onChange(
      {
        workspaceId: workspace,
        ...(lastEventId !== undefined && { lastEventId }),
      },
    );
    return { controller, events: stream[Symbol.asyncIterator]() };
  }

  it("rejects a blank workspaceId (BAD_REQUEST)", async () => {
    await expectTRPCError(
      caller.assistant.onChange({ workspaceId: "" }),
      "BAD_REQUEST",
    );
  });

  it("streams a snapshot, every change, then closes itself when the run ends", async () => {
    const fresh = await makeWorkspace("assistant stream");
    const { controller, events } = await openStream(fresh.id);
    try {
      const snapshot = await nextTracked<AssistantChange>(events);
      expect(snapshot.data).toEqual({ type: "snapshot", run: null });
      expect(snapshot.id).toBe("0");

      const run = await caller.assistant.start({
        workspaceId: fresh.id,
        scope: "dashboard",
        prompt: "Add a card",
      });
      const created = await nextTracked<AssistantChange>(events);
      expect(created.data).toMatchObject({
        type: "run",
        run: { id: run.id, status: "pending", workspaceId: fresh.id },
      });
      expect(created.id).toBe(String(run.updatedAt.getTime()));

      // Another workspace's run is not streamed here.
      await withRun(async () => {});

      await assistantService.markThinking(run.id);
      const thinking = await nextTracked<AssistantChange>(events);
      expect(thinking.data).toMatchObject({
        type: "run",
        run: { id: run.id, status: "thinking" },
      });

      const done = await caller.assistant.cancel({ id: run.id });
      const cancelled = await nextTracked<AssistantChange>(events);
      expect(cancelled.data).toMatchObject({
        type: "run",
        run: { id: run.id, status: "cancelled" },
      });
      expect(cancelled.id).toBe(String(done.updatedAt.getTime()));

      const closed = await nextTracked<AssistantChange>(events);
      expect(closed.data).toEqual({ type: "closed" });
      expect((await events.next()).done).toBe(true);

      // A reconnecting client replays from its last event id, then gets the
      // snapshot again — null, the run is terminal — and stays open.
      const resumed = await openStream(fresh.id, created.id);
      try {
        const replayed = await nextTracked<AssistantChange>(resumed.events);
        expect(replayed.data).toMatchObject({
          type: "run",
          run: { id: run.id, status: "cancelled" },
        });
        const resnapshot = await nextTracked<AssistantChange>(resumed.events);
        expect(resnapshot.data).toEqual({ type: "snapshot", run: null });
        expect(resnapshot.id).toBe(cancelled.id);
      } finally {
        resumed.controller.abort();
        await resumed.events.return?.();
      }
    } finally {
      controller.abort();
      await events.return?.();
      await removeWorkspace(fresh.id);
    }
  });

  it("a fresh subscriber sees the active run in its snapshot", async () => {
    await withRun(async (run) => {
      const { controller, events } = await openStream(workspaceId);
      try {
        const snapshot = await nextTracked<AssistantChange>(events);
        expect(snapshot.data).toMatchObject({
          type: "snapshot",
          run: { id: run.id, status: "pending" },
        });
        expect(snapshot.id).toBe(String(run.updatedAt.getTime()));
      } finally {
        controller.abort();
        await events.return?.();
      }
    });
  });
});

describe.skipIf(!dbUp)("the executor (spreadsheet scope)", () => {
  const confirm = { outcome: "approved" as ConfirmationOutcome, asked: 0 };
  let executor: AssistantExecutor;
  let step = 0;

  const fakeRun = (scope: "dashboard" | "spreadsheet"): AssistantRun => ({
    id: "executor-contract",
    workspaceId,
    spreadsheetId: sheetId,
    scope,
    source: "user",
    prompt: PROMPT,
    status: "working",
    steps: [],
    pendingAction: null,
    summary: null,
    error: null,
    model: null,
    usage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const call = (toolName: string, input: unknown) =>
    executor.execute(step++, { toolCallId: `call-${step}`, toolName, input });

  beforeAll(() => {
    executor = new AssistantExecutor(fakeRun("spreadsheet"), sheetId, {
      confirm: async () => {
        confirm.asked += 1;
        return confirm.outcome;
      },
    });
  });

  it("reads rows and summarises a column", async () => {
    const read = await call("readRows", { limit: 2 });
    expect(read.status).toBe("done");
    expect(read.mutated).toBe(false);
    expect(read.output).toMatchObject({
      rows: [
        { index: 0, cells: { Name: "Ada", Fees: "100", Country: "US" } },
        { index: 1, cells: { Name: "Bob", Fees: "250" } },
      ],
      hasMore: true,
      nextStartRow: 2,
    });
    const summary = await call("getColumnSummary", { column: "fees" });
    expect(summary.output).toMatchObject({
      column: "Fees",
      type: "number",
      storedRows: 3,
      filled: 3,
      blank: 0,
      numbers: { min: 50, max: 250, sum: 400, average: 400 / 3 },
    });
  });

  it("creates, renames and reorders a column, naming columns case-insensitively", async () => {
    const created = await call("createColumn", { name: "Status" });
    expect(created).toMatchObject({
      status: "done",
      mutated: true,
      input: { name: "Status", type: "string" },
    });
    const renamed = await call("updateColumn", {
      column: "STATUS",
      name: "State",
    });
    expect(renamed.status).toBe("done");
    expect(renamed.output).toMatchObject({ column: { name: "State" } });
    const moved = await call("reorderColumn", { column: "State", position: 0 });
    expect(moved.output).toMatchObject({
      order: ["State", "Name", "Fees", "Country"],
    });
  });

  it("writes cells by list and by rule, coercing values to the column type", async () => {
    const set = await call("setCells", {
      column: "Fees",
      cells: [{ rowIndex: 2, value: "75" }],
    });
    expect(set).toMatchObject({
      status: "done",
      mutated: true,
      input: { column: "Fees", count: 1 },
    });
    expect(
      (
        await caller.spreadsheet.cell({
          id: sheetId,
          rowIndex: 2,
          columnIndex: feesColumn,
        })
      ).value,
    ).toBe(75);

    const filled = await call("fillColumn", {
      column: "Country",
      value: "US",
      where: { column: "Country", op: "isEmpty" },
    });
    expect(filled).toMatchObject({
      status: "done",
      input: { column: "Country", value: "US", count: 2 },
    });
    const rows = await caller.spreadsheet.rows({ id: sheetId });
    for (const row of rows.rows.slice(0, 3)) {
      expect(row.columns.find((c) => c.name === "Country")?.value).toBe("US");
    }
  });

  it("appends rows by column name", async () => {
    const appended = await call("appendRows", {
      rows: [
        {
          cells: [
            { column: "Name", value: "Dee" },
            { column: "Fees", value: 10 },
          ],
        },
        { cells: [{ column: "name", value: "Eve" }] },
      ],
    });
    expect(appended).toMatchObject({
      status: "done",
      input: { count: 2 },
      output: { appended: 2, firstIndex: 3, lastIndex: 4 },
    });
  });

  it("turns the model's mistakes into failed steps it can read, never into a failed run", async () => {
    const unknownTool = await call("createWidget", { name: "x" });
    expect(unknownTool.status).toBe("failed");
    expect(unknownTool.error).toContain("Unknown tool");

    const badInput = await call("setCells", { column: "Fees", cells: [] });
    expect(badInput.status).toBe("failed");
    expect(badInput.error).toContain("Invalid input");

    const unknownColumn = await call("updateColumn", {
      column: "Nope",
      name: "X",
    });
    expect(unknownColumn.status).toBe("failed");
    expect(unknownColumn.error).toContain("UNKNOWN_COLUMN");
    expect(unknownColumn.output).toMatchObject({
      error: { code: "UNKNOWN_COLUMN" },
    });

    const nameTaken = await call("createColumn", { name: "name" });
    expect(nameTaken.status).toBe("failed");
    expect(nameTaken.error).toContain("SPREADSHEET_COLUMN_NAME_TAKEN");

    const wrongType = await call("setCells", {
      column: "Fees",
      cells: [{ rowIndex: 0, value: "not a number" }],
    });
    expect(wrongType.status).toBe("failed");
    expect(wrongType.error).toContain("SPREADSHEET_CELL_TYPE_MISMATCH");
  });

  it("asks before deleting rows and a column; a refusal declines the step and changes nothing", async () => {
    confirm.outcome = "declined";
    const kept = await call("removeColumn", { column: "State" });
    expect(kept).toMatchObject({
      status: "declined",
      mutated: false,
      input: { column: "State", count: 0 },
      output: { declined: true },
    });
    expect(confirm.asked).toBe(1);
    expect(
      (await caller.spreadsheet.rows({ id: sheetId })).columns.map(
        (c) => c.name,
      ),
    ).toContain("State");

    confirm.outcome = "approved";
    const removedRows = await call("removeRows", {
      where: { column: "Name", op: "in", values: ["Dee", "Eve"] },
    });
    expect(removedRows).toMatchObject({
      status: "done",
      mutated: true,
      input: { count: 2 },
    });
    const removedColumn = await call("removeColumn", { column: "State" });
    expect(removedColumn).toMatchObject({
      status: "done",
      input: { column: "State", count: 0 },
    });
    expect(confirm.asked).toBe(3);
    const after = await caller.spreadsheet.rows({ id: sheetId });
    expect(after.rows.map((row) => row.index)).toEqual([0, 1, 2]);
    expect(after.columns.map((c) => c.name)).toEqual([
      "Name",
      "Fees",
      "Country",
    ]);

    const nothing = await call("removeRows", {
      where: { column: "Name", op: "eq", value: "Nobody" },
    });
    expect(nothing.status).toBe("failed");
    expect(nothing.error).toContain("NO_MATCH");
  });

  it("the dashboard scope does not offer the sheet's write tools", async () => {
    const dashboardExecutor = new AssistantExecutor(
      fakeRun("dashboard"),
      sheetId,
      {
        confirm: async () => "approved",
      },
    );
    const refused = await dashboardExecutor.execute(0, {
      toolCallId: "x",
      toolName: "removeColumn",
      input: { column: "Fees" },
    });
    expect(refused.status).toBe("failed");
    expect(refused.error).toContain("Unknown tool");
  });
});

describe.skipIf(!dbUp)("the executor (dashboard scope)", () => {
  let executor: AssistantExecutor;
  let outcome: ConfirmationOutcome = "approved";
  let step = 0;
  const call = (toolName: string, input: unknown) =>
    executor.execute(step++, { toolCallId: `dash-${step}`, toolName, input });

  beforeAll(() => {
    executor = new AssistantExecutor(
      {
        id: "executor-dashboard",
        workspaceId,
        spreadsheetId: sheetId,
        scope: "dashboard",
        source: "user",
        prompt: "Add cards",
        status: "working",
        steps: [],
        pendingAction: null,
        summary: null,
        error: null,
        model: null,
        usage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      sheetId,
      { confirm: async () => outcome },
    );
  });

  afterAll(async () => {
    await caller.dashboard.remove({ workspaceId }).catch(() => {});
  });

  it("creates cards, placing each new one in the first row with room and a width for its type", async () => {
    const stat = await call("createWidget", {
      name: "Total fees",
      type: "stat",
      query: {
        series: [{ key: "sum", label: "Total", formula: "SUM({Fees})" }],
      },
    });
    expect(stat).toMatchObject({
      status: "done",
      mutated: true,
      input: { name: "Total fees", type: "stat" },
    });
    expect(stat.output).toMatchObject({
      dashboard: {
        widgets: [
          { name: "Total fees", row: 0, sort: 0, column: 3, height: "md" },
        ],
      },
    });
    expect(typeof stat.input.id).toBe("string");

    const bar = await call("createWidget", {
      name: "Fees by name",
      type: "bar",
      height: "lg",
      query: {
        groupBy: { column: "Name" },
        series: [{ key: "fees", label: "Fees", formula: "SUM({Fees})" }],
        filters: [{ column: "Fees", op: "gt", value: 0 }],
      },
    });
    expect(bar.output).toMatchObject({
      dashboard: {
        widgets: [
          { name: "Total fees", row: 0, sort: 0 },
          { name: "Fees by name", row: 0, sort: 1, column: 6, height: "lg" },
        ],
      },
    });
  });

  it("reports the dashboard's validation errors to the model", async () => {
    const unknownColumn = await call("createWidget", {
      name: "Broken",
      type: "stat",
      query: { series: [{ key: "t", label: "T", formula: "SUM({Nope})" }] },
    });
    expect(unknownColumn.status).toBe("failed");
    expect(unknownColumn.error).toContain("DASHBOARD_UNKNOWN_COLUMN");

    const notGrouped = await call("createWidget", {
      name: "Broken too",
      type: "bar",
      query: { series: [{ key: "t", label: "T", formula: "SUM({Fees})" }] },
    });
    expect(notGrouped.status).toBe("failed");
    expect(notGrouped.error).toContain("DASHBOARD_QUERY_INVALID");

    const unknownCard = await call("updateWidget", { id: "nope", name: "X" });
    expect(unknownCard.status).toBe("failed");
    expect(unknownCard.error).toContain("UNKNOWN_WIDGET");
  });

  it("updates a card and the dashboard's title, and asks before removing a card", async () => {
    const detail = await caller.dashboard.byWorkspace({ workspaceId });
    const stat = detail?.widgets.find((w) => w.name === "Total fees");
    if (!stat) throw new Error("the stat card should exist");

    const renamed = await call("updateWidget", {
      id: stat.id,
      name: "Fees collected",
    });
    expect(renamed).toMatchObject({
      status: "done",
      input: { name: "Fees collected", type: "stat" },
    });

    const titled = await call("updateDashboard", { title: "Finance" });
    expect(titled.output).toMatchObject({ dashboard: { title: "Finance" } });

    outcome = "declined";
    const kept = await call("removeWidget", { id: stat.id });
    expect(kept).toMatchObject({
      status: "declined",
      input: { id: stat.id, name: "Fees collected", type: "stat" },
    });

    outcome = "approved";
    const removed = await call("removeWidget", { id: stat.id });
    expect(removed.status).toBe("done");
    expect(removed.output).toMatchObject({ removed: "Fees collected" });
    const after = await caller.dashboard.byWorkspace({ workspaceId });
    expect(after?.widgets.map((w) => w.name)).toEqual(["Fees by name"]);
  });
});

describe.skipIf(!dbUp)("POST /assistant/transcribe", () => {
  let baseUrl = "";
  let close: () => Promise<void> = async () => {};
  let savedKey: string | undefined;

  const post = (body: FormData) =>
    fetch(`${baseUrl}/assistant/transcribe`, { method: "POST", body });
  const clip = (type: string) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(64)], { type }), "clip.webm");
    return form;
  };

  beforeAll(async () => {
    const server = await startTestServer();
    baseUrl = server.baseUrl;
    close = server.close;
    // Never reach ElevenLabs from the suite: the route must answer 503 instead.
    savedKey = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
  });

  afterAll(async () => {
    if (savedKey !== undefined) process.env.ELEVENLABS_API_KEY = savedKey;
    await close();
  });

  it("answers 400 without a file and for a non-audio upload", async () => {
    expect((await post(new FormData())).status).toBe(400);
    const res = await post(clip("text/plain"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "ASSISTANT_TRANSCRIPTION_INVALID",
    });
  });

  it("answers 503 ASSISTANT_TRANSCRIPTION_UNAVAILABLE without an ElevenLabs key", async () => {
    const res = await post(clip("audio/webm"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      code: "ASSISTANT_TRANSCRIPTION_UNAVAILABLE",
    });
  });
});

describe.skipIf(!dbUp)("assistant.recommendWidgets", () => {
  let savedKey: string | undefined;
  const usage = { inputTokens: 1, outputTokens: 2, totalTokens: 3 };
  const card = (over: Record<string, unknown> = {}) => ({
    name: "Total fees",
    type: "stat",
    query: {
      series: [{ key: "sum", label: "Total", formula: "SUM({Fees})" }],
    },
    ...over,
  });
  const generator =
    (cards: unknown[]): RecommendationGenerator =>
    async () => ({ cards, model: "fake-model", usage });

  beforeAll(() => {
    savedKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  afterAll(async () => {
    if (savedKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = savedKey;
    await caller.dashboard.remove({ workspaceId }).catch(() => {});
  });

  it("is NOT_FOUND for an unknown workspace and SERVICE_UNAVAILABLE without a Gemini key on the api", async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    await expectTRPCError(
      caller.assistant.recommendWidgets({ workspaceId: "does-not-exist" }),
      "NOT_FOUND",
    );
    await expectTRPCError(
      caller.assistant.recommendWidgets({ workspaceId }),
      "SERVICE_UNAVAILABLE",
    );
  });

  it("keeps the cards that pass the contract and the engine, fills their defaults and counts the rest", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "contract-test-key";
    const result = await assistantRecommendService.recommend(
      { workspaceId },
      {
        generate: generator([
          card(),
          card({
            name: "Fees by country",
            description: "Where the fees come from",
            type: "bar",
            height: "lg",
            column: 12,
            query: {
              groupBy: { column: "Country" },
              series: [{ key: "fees", label: "Fees", formula: "SUM({Fees})" }],
            },
          }),
          card({
            name: "Unknown column",
            query: {
              series: [{ key: "x", label: "X", formula: "SUM({Nope})" }],
            },
          }),
          card({
            name: "Two series pie",
            type: "pie",
            query: {
              groupBy: { column: "Country" },
              series: [
                { key: "a", label: "A", formula: "COUNT()" },
                { key: "b", label: "B", formula: "COUNT()" },
              ],
            },
          }),
          card({
            name: "Bad key",
            query: {
              series: [{ key: "total fees", label: "T", formula: "COUNT()" }],
            },
          }),
          { name: "", type: "stat" },
          card({ name: "Repeat" }),
        ]),
      },
    );
    expect(result).toMatchObject({
      spreadsheetId: sheetId,
      skipped: 5,
      model: "fake-model",
      usage,
    });
    expect(result.recommendations).toEqual([
      {
        name: "Total fees",
        description: null,
        type: "stat",
        variant: "default",
        height: "md",
        column: 3,
        query: {
          filters: [],
          groupBy: null,
          series: [{ key: "sum", label: "Total", formula: "SUM({Fees})" }],
        },
      },
      {
        name: "Fees by country",
        description: "Where the fees come from",
        type: "bar",
        variant: "default",
        height: "lg",
        column: 12,
        query: {
          filters: [],
          groupBy: { column: "Country", bucket: "none" },
          series: [{ key: "fees", label: "Fees", formula: "SUM({Fees})" }],
        },
      },
    ]);
  });

  it("skips a card the dashboard already has and caps the set at six", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "contract-test-key";
    await caller.dashboard.createWidget({
      workspaceId,
      name: "Total fees",
      type: "stat",
      column: 3,
      query: {
        series: [{ key: "sum", label: "Total", formula: "SUM({Fees})" }],
      },
    });
    const counts = Array.from({ length: 8 }, (_, index) =>
      card({
        name: `Count ${index}`,
        query: {
          series: [{ key: `c${index}`, label: "Rows", formula: "COUNT()" }],
        },
      }),
    );
    const result = await assistantRecommendService.recommend(
      { workspaceId },
      { generate: generator([card(), ...counts]) },
    );
    expect(result.recommendations.map((item) => item.name)).toEqual(
      counts.slice(0, 6).map((item) => item.name),
    );
    expect(result.skipped).toBe(3);
  });

  it("is BAD_GATEWAY when the model call fails", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "contract-test-key";
    const error = await expectError(
      assistantRecommendService.recommend(
        { workspaceId },
        {
          generate: async () => {
            throw new Error("quota exhausted");
          },
        },
      ),
      AssistantRecommendationsFailedError,
    );
    expect(error.message).toContain("quota exhausted");
  });
});

/* ------------------------------------------------ pure, no key, no database */

describe("the tool table", () => {
  it("offers each scope its tools, the destructive ones named", () => {
    expect(Object.keys(toolsForScope("spreadsheet"))).toEqual([
      ...ASSISTANT_SPREADSHEET_TOOLS,
    ]);
    expect(Object.keys(toolsForScope("dashboard"))).toEqual([
      ...ASSISTANT_DASHBOARD_TOOLS,
    ]);
    expect(toolNamesForScope("dashboard")).toEqual(ASSISTANT_DASHBOARD_TOOLS);
    expect([...ASSISTANT_DESTRUCTIVE_TOOLS].every(isDestructiveTool)).toBe(
      true,
    );
    expect(isDestructiveTool("createColumn")).toBe(false);
    for (const name of Object.keys(ASSISTANT_TOOLS)) {
      expect(
        ASSISTANT_TOOLS[name as AssistantToolName].description.length,
      ).toBeGreaterThan(20);
    }
  });

  it("caps what one call may touch", () => {
    const cells = (count: number) =>
      Array.from({ length: count }, (_, rowIndex) => ({ rowIndex, value: 1 }));
    expect(
      ASSISTANT_TOOLS.setCells.inputSchema.safeParse({
        column: "A",
        cells: cells(500),
      }).success,
    ).toBe(true);
    expect(
      ASSISTANT_TOOLS.setCells.inputSchema.safeParse({
        column: "A",
        cells: cells(501),
      }).success,
    ).toBe(false);
    const rows = (count: number) =>
      Array.from({ length: count }, () => ({
        cells: [{ column: "A", value: 1 }],
      }));
    expect(
      ASSISTANT_TOOLS.appendRows.inputSchema.safeParse({ rows: rows(101) })
        .success,
    ).toBe(false);
    expect(
      ASSISTANT_TOOLS.removeRows.inputSchema.safeParse({
        rowIndexes: Array.from({ length: 1001 }, (_, i) => i),
      }).success,
    ).toBe(false);
    expect(ASSISTANT_TOOLS.removeRows.inputSchema.safeParse({}).success).toBe(
      false,
    );
    expect(
      ASSISTANT_TOOLS.readRows.inputSchema.safeParse({ limit: 51 }).success,
    ).toBe(false);
    expect(ASSISTANT_TOOLS.readRows.inputSchema.parse({})).toEqual({
      startRow: 0,
      limit: 20,
    });
  });

  it("summarises a call's input to identifiers and counts, merging what execution adds", () => {
    expect(
      summariseStepInput("setCells", {
        column: "Fees",
        cells: [
          { rowIndex: 0, value: 1 },
          { rowIndex: 1, value: 2 },
        ],
      }),
    ).toEqual({ column: "Fees", count: 2 });
    expect(
      summariseStepInput(
        "fillColumn",
        {
          column: "Country",
          value: "US",
          where: { column: "Country", op: "isEmpty" },
        },
        { count: 12 },
      ),
    ).toEqual({
      column: "Country",
      value: "US",
      where: { column: "Country", op: "isEmpty" },
      count: 12,
    });
    expect(summariseStepInput("removeRows", { rowIndexes: [1, 2, 3] })).toEqual(
      { count: 3 },
    );
    expect(
      summariseStepInput("createWidget", {
        name: "Total",
        type: "stat",
        query: { series: [] },
      }),
    ).toEqual({ name: "Total", type: "stat" });
    expect(summariseStepInput("createColumn", { name: "X" })).toEqual({
      name: "X",
      type: "string",
    });
    expect(summariseStepInput("readRows", undefined)).toEqual({
      startRow: 0,
      limit: 20,
    });
  });

  it("gives a new card a width that fits its type", () => {
    expect(defaultWidgetSpan("stat")).toBe(3);
    expect(defaultWidgetSpan("table")).toBe(12);
    expect(defaultWidgetSpan("bar")).toBe(6);
  });

  it("maps the flat tool query onto the engine's query", () => {
    expect(
      toWidgetQueryInput({
        series: [{ key: "t", label: "T", formula: "SUM({A})" }],
        filters: [
          { column: "A", op: "in", values: ["x", 1] },
          { column: "B", op: "isEmpty" },
        ],
        groupBy: { column: "C" },
      }),
    ).toEqual({
      filters: [
        { column: "A", op: "in", value: ["x", 1] },
        { column: "B", op: "isEmpty" },
      ],
      groupBy: { column: "C", bucket: "none" },
      series: [{ key: "t", label: "T", formula: "SUM({A})" }],
    });
    expect(
      toWidgetQueryInput({
        series: [{ key: "t", label: "T", formula: "COUNT()" }],
      }),
    ).toEqual({
      filters: [],
      groupBy: null,
      series: [{ key: "t", label: "T", formula: "COUNT()" }],
    });
  });

  it("a budget refuses the write that would overrun it", () => {
    const budget = new ToolBudget(3);
    budget.takeCellWrites(2);
    expect(budget.remainingCellWrites).toBe(1);
    expect(() => budget.takeCellWrites(2)).toThrow(ToolInputError);
    budget.takeCellWrites(1);
    expect(budget.remainingCellWrites).toBe(0);
  });
});

describe("the sheet helpers", () => {
  const payload: SheetPayload = {
    spreadsheet: { id: "s", name: "Sheet", totalRows: 10, totalColumns: 3 },
    columns: [
      {
        id: "col.0",
        index: 0,
        sortOrder: 0,
        name: "Name",
        type: "string",
        node: null,
        prompt: null,
      },
      {
        id: "col.1",
        index: 1,
        sortOrder: 1,
        name: "Fees",
        type: "number",
        node: null,
        prompt: null,
      },
      {
        id: "col.2",
        index: 2,
        sortOrder: 2,
        name: "Paid on",
        type: "date",
        node: null,
        prompt: null,
      },
    ],
    rows: [
      {
        id: "row.0",
        index: 0,
        columns: [
          { id: "col.0", name: "Name", value: "Ada" },
          { id: "col.1", name: "Fees", value: 100 },
          { id: "col.2", name: "Paid on", value: "2026-01-05" },
        ],
      },
      {
        id: "row.1",
        index: 1,
        columns: [
          { id: "col.0", name: "Name", value: "Bob" },
          { id: "col.1", name: "Fees", value: 50 },
        ],
      },
      {
        id: "row.4",
        index: 4,
        columns: [{ id: "col.0", name: "Name", value: "Ada" }],
      },
    ],
    pagination: { startRow: 0, limit: 100, hasMore: false, nextCursor: null },
  };

  it("resolves a column by name, trimmed and case-insensitively, or names the known ones", () => {
    expect(resolveColumn(payload.columns, "  fees ").name).toBe("Fees");
    const error = (() => {
      try {
        resolveColumn(payload.columns, "Nope");
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(ToolInputError);
    expect((error as ToolInputError).code).toBe("UNKNOWN_COLUMN");
    expect((error as Error).message).toContain('"Fees"');
  });

  it("selects rows by rule through the engine's filters", () => {
    expect(
      selectRowIndexes(payload, { column: "Fees", op: "isEmpty" }),
    ).toEqual([4]);
    expect(
      selectRowIndexes(payload, { column: "fees", op: "gte", value: 100 }),
    ).toEqual([0]);
    expect(
      selectRowIndexes(payload, { column: "Name", op: "in", values: ["Ada"] }),
    ).toEqual([0, 4]);
    expect(toWidgetFilter({ column: "A", op: "in", values: [1] })).toEqual({
      column: "A",
      op: "in",
      value: [1],
    });
    expect(toWidgetFilter({ column: "A", op: "notEmpty" })).toEqual({
      column: "A",
      op: "notEmpty",
    });
  });

  it("summarises a column: fill rate, top values, numeric and date ranges", () => {
    const name = summariseColumn(payload.rows, payload.columns[0] as never);
    expect(name).toMatchObject({
      column: "Name",
      storedRows: 3,
      filled: 3,
      blank: 0,
      topValues: [
        { value: "Ada", count: 2 },
        { value: "Bob", count: 1 },
      ],
    });
    expect(name.numbers).toBeUndefined();
    const fees = summariseColumn(payload.rows, payload.columns[1] as never);
    expect(fees).toMatchObject({
      filled: 2,
      blank: 1,
      distinct: 2,
      role: "measure",
      numbers: { min: 50, max: 100, sum: 150, average: 75 },
    });
    const paid = summariseColumn(payload.rows, payload.columns[2] as never);
    expect(paid.dates?.min).toBe("2026-01-05T00:00:00.000Z");
    expect(paid.role).toBe("time");
  });

  it("shapes a model value for its column type", () => {
    expect(coerceToolValue('{"a":1}', "json")).toEqual({ a: 1 });
    expect(coerceToolValue("not json", "json")).toBe("not json");
    expect(coerceToolValue("42", "number")).toBe(42);
    expect(coerceToolValue("abc", "number")).toBe("abc");
    expect(coerceToolValue("TRUE", "boolean")).toBe(true);
    expect(coerceToolValue(42, "string")).toBe("42");
    expect(coerceToolValue(null, "number")).toBeNull();
    expect(coerceToolValue("2026-01-01", "date")).toBe("2026-01-01");
  });
});

describe("the prompt and the step helpers", () => {
  const context = {
    workspaceName: "Acme",
    sheet: { name: "Students", storedRows: 1234 },
    columns: [
      { name: "Name", type: "string", node: null },
      { name: "Summary", type: "string", node: "ai" },
    ],
    sampleRows: Array.from({ length: 15 }, (_, index) => ({
      index,
      cells: [{ name: "Name", value: `Student ${index} ${"x".repeat(200)}` }],
    })),
  };

  it("builds the spreadsheet prompt with tagged data, capped samples and no widget grammar", () => {
    const prompt = buildAssistantSystemPrompt({
      ...context,
      scope: "spreadsheet",
    });
    expect(prompt).toContain(UNTRUSTED_DATA_RULE);
    expect(prompt).toContain(
      'Workspace "Acme", sheet "Students" with 1234 stored rows.',
    );
    expect(prompt).toContain(
      "<columns>\n- Name (string)\n- Summary (string, node ai)\n</columns>",
    );
    expect(prompt.match(/^- row \d+:/gm)).toHaveLength(MAX_SAMPLE_ROWS);
    expect(prompt).toContain("x".repeat(60));
    expect(prompt).not.toContain("x".repeat(100));
    expect(prompt).not.toContain("</widgets>");
    expect(prompt).not.toContain(WIDGET_GRAMMAR);
  });

  it("builds the dashboard prompt with the grammar and the current cards", () => {
    const prompt = buildAssistantSystemPrompt({
      ...context,
      scope: "dashboard",
      dashboard: {
        title: "Finance",
        description: null,
        widgets: [
          {
            id: "w1",
            name: "Total",
            type: "stat",
            variant: "default",
            row: 0,
            column: 3,
            sort: 0,
            height: "sm",
            query: { series: [] },
          },
        ],
      },
    });
    expect(prompt).toContain(WIDGET_GRAMMAR);
    expect(prompt).toContain("Dashboard title: Finance; subtitle: (default).");
    expect(prompt).toContain(
      '<widgets>\n- w1: "Total" stat/default height sm at row 0, sort 0, width 3;',
    );
    const empty = buildAssistantSystemPrompt({
      ...context,
      scope: "dashboard",
      dashboard: null,
    });
    expect(empty).toContain("has no dashboard yet");
    expect(empty).toContain(CHART_SENSE_RULES);
  });

  it("adds the column profile and the chart rules to the dashboard prompt only", () => {
    const profile: ColumnProfile[] = [
      {
        name: "Year",
        type: "number",
        role: "year",
        rows: 3,
        filled: 3,
        blank: 0,
        distinct: 3,
        topValues: [],
        numbers: {
          min: 2021,
          max: 2023,
          sum: 6066,
          average: 2022,
          integers: true,
        },
      },
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
      {
        name: "Signed",
        type: "date",
        role: "time",
        rows: 3,
        filled: 2,
        blank: 1,
        distinct: 2,
        topValues: [],
        dates: {
          min: "2026-01-05T00:00:00.000Z",
          max: "2026-02-10T00:00:00.000Z",
        },
      },
    ];
    const prompt = buildAssistantSystemPrompt({
      ...context,
      scope: "dashboard",
      dashboard: null,
      profile,
      profiledRows: 3,
    });
    expect(prompt).toContain(
      [
        "Column profile over the first 3 of the 1234 stored rows:",
        "<column-profile>",
        "- Year (number, year): 3 filled, 0 blank, every value distinct; min 2021, max 2023, average 2022",
        "- Region (string, category): 3 filled, 0 blank, 2 distinct; top: EMEA 2, APAC 1",
        "- Signed (date, time): 2 filled, 1 blank, every value distinct; from 2026-01-05 to 2026-02-10",
        "</column-profile>",
      ].join("\n"),
    );
    const sheet = buildAssistantSystemPrompt({
      ...context,
      scope: "spreadsheet",
      profile,
      profiledRows: 3,
    });
    expect(sheet).not.toContain("</column-profile>");
    expect(sheet).not.toContain(CHART_SENSE_RULES);
  });

  it("builds the recommendation prompt without the tool-loop rules", () => {
    const { system, prompt } = buildRecommendationPrompt(
      { ...context, scope: "dashboard", dashboard: null },
      6,
    );
    expect(system).toContain(UNTRUSTED_DATA_RULE);
    expect(system).toContain(WIDGET_GRAMMAR);
    expect(system).toContain(CHART_SENSE_RULES);
    expect(system).toContain("has no dashboard yet");
    expect(system).not.toContain("one tool call at a time");
    expect(prompt).toContain("up to 6 dashboard cards");
  });

  it("truncates values to one line", () => {
    expect(truncateValue("a\n b   c")).toBe("a b c");
    expect(truncateValue({ a: 1 })).toBe('{"a":1}');
    expect(truncateValue(null)).toBe("");
    expect(truncateValue("y".repeat(100), 10)).toBe(`${"y".repeat(9)}…`);
  });

  it("sums usage and builds the tool-result message", () => {
    expect(
      toUsage({
        inputTokens: 3,
        outputTokens: 4,
        totalTokens: undefined,
      } as never),
    ).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
    expect(
      addUsage(
        { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      ),
    ).toEqual({ inputTokens: 3, outputTokens: 4, totalTokens: 7 });
    expect(
      toolResultsMessage([
        {
          toolCallId: "c1",
          toolName: "readRows",
          output: { rows: [], when: new Date(0) },
        },
      ]),
    ).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "readRows",
          output: {
            type: "json",
            value: { rows: [], when: "1970-01-01T00:00:00.000Z" },
          },
        },
      ],
    });
  });

  it("trims a transcript to its cap: tool outputs first, then the oldest messages", () => {
    const big = "z".repeat(5_000);
    const messages = [
      { role: "user" as const, content: "do it" },
      toolResultsMessage([
        { toolCallId: "a", toolName: "readRows", output: { big } },
      ]),
      toolResultsMessage([
        { toolCallId: "b", toolName: "readRows", output: { big } },
      ]),
      { role: "assistant" as const, content: "done" },
    ];
    const trimmed = trimTranscript(messages, 6_000);
    expect(JSON.stringify(trimmed).length).toBeLessThanOrEqual(6_000);
    expect(trimmed[0]).toEqual({ role: "user", content: "do it" });
    expect(trimmed.at(-1)).toEqual({ role: "assistant", content: "done" });
    expect(JSON.stringify(trimmed)).toContain("[truncated]");
    expect(trimTranscript(messages, 1_000_000)).toEqual(messages);
  });
});
