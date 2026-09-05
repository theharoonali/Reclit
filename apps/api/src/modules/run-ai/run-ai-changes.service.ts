import { EventEmitter, on } from "node:events";
import { describeError } from "../../common/errors";
import type { RunAiFeedNotice } from "./run-ai.feed";
import { runAiFeed } from "./run-ai.feed";
import type {
  RunAi,
  RunAiChange,
  RunAiChangesInput,
  RunAiEvent,
} from "./run-ai.schema";
import { isTerminalRunAiStatus } from "./run-ai.schema";
import { runAiService } from "./run-ai.service";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The `runAi.onChange`
// stream: feed notices (row ids) are resolved into rows once per process and
// re-emitted, and `changes()` turns them into one sheet's replay + snapshot +
// live events. Reads go through `runAiService`; nothing here writes. This
// pair (feed + generator) is the pattern for the next live table.

/** The SSE event id: the row's `updatedAt` in ms, so replay is a range query. */
const eventId = (run: RunAi) => String(run.updatedAt.getTime());

/** "0" replays everything; anything unparsable replays nothing. */
function parseEventId(id: string | null | undefined): Date | null {
  if (id === null || id === undefined || id === "") return null;
  const ms = Number(id);
  return Number.isFinite(ms) && ms >= 0 ? new Date(ms) : null;
}

const runEvent = (run: RunAi): RunAiEvent => ({
  id: eventId(run),
  change: { type: "run", run },
});

type LiveChange = { kind: "run"; run: RunAi } | { kind: "resync" };

export class RunAiChangesService {
  /** Resolved changes, emitted as `"change"` with a `LiveChange`. */
  private readonly events = new EventEmitter();
  private pumping = false;

  constructor() {
    this.events.setMaxListeners(0);
  }

  /**
   * The stream for one sheet: a replay of everything since `lastEventId`
   * (when reconnecting), then a snapshot of the working runs, then every
   * change as it happens — until a terminal change leaves the sheet with
   * nothing working, when `closed` is the last event and the stream ends (a
   * generation, not a socket; the sheet reopens it the next time a run
   * starts). Subscribes to the live feed *before* reading, so nothing can
   * slip between the snapshot and the first live event. Also ends when
   * `signal` aborts (client gone).
   */
  async *changes(
    input: RunAiChangesInput,
    signal?: AbortSignal,
  ): AsyncGenerator<RunAiEvent, void, undefined> {
    await runAiFeed.ensureStarted();
    this.ensurePump();
    const live = on(this.events, "change", { signal }) as AsyncIterableIterator<
      [LiveChange]
    >;
    try {
      const since = parseEventId(input.lastEventId);
      if (since) {
        for (const run of await runAiService.listChangedSince(
          input.spreadsheetId,
          since,
        )) {
          yield runEvent(run);
        }
      }
      yield await this.snapshot(input.spreadsheetId);
      for await (const [change] of live) {
        if (change.kind === "resync") {
          yield await this.snapshot(input.spreadsheetId);
          continue;
        }
        const run = change.run;
        if (run.spreadsheetId !== input.spreadsheetId) continue;
        yield runEvent(run);
        if (!isTerminalRunAiStatus(run.status)) continue;
        const working = await runAiService.listActiveBySpreadsheet(
          input.spreadsheetId,
        );
        if (working.length === 0) {
          yield { id: eventId(run), change: { type: "closed" } };
          return;
        }
      }
    } catch (error) {
      // `on()` rejects with AbortError when the signal fires; that is the
      // normal end of a subscription, not a failure.
      if (signal?.aborted) return;
      throw error;
    } finally {
      await live.return?.();
    }
  }

  /**
   * Tracked by the newest `updatedAt` of the sheet, so a reconnect replays
   * from a database timestamp rather than this process's clock. "0" (no
   * runs yet) replays everything created since — which is exactly what a
   * subscriber that saw an empty sheet needs.
   */
  private async snapshot(spreadsheetId: string): Promise<RunAiEvent> {
    const [runs, id] = await Promise.all([
      runAiService.listActiveBySpreadsheet(spreadsheetId),
      runAiService.latestEventId(spreadsheetId),
    ]);
    const change: RunAiChange = { type: "snapshot", runs };
    return { id, change };
  }

  /**
   * One listener per process resolves feed notices (row ids) into rows and
   * re-emits them, so N subscribers cost one read per change, not N. Each
   * read returns the row as it is *now*, so out-of-order resolution can only
   * ever repeat the latest state, never regress it.
   */
  private ensurePump() {
    if (this.pumping) return;
    this.pumping = true;
    runAiFeed.events.on("notice", (notice: RunAiFeedNotice) => {
      if (notice.kind === "resync") {
        this.events.emit("change", { kind: "resync" } satisfies LiveChange);
        return;
      }
      runAiService
        .find(notice.id)
        .then((run) => {
          if (run) this.events.emit("change", { kind: "run", run });
        })
        .catch((error: unknown) => {
          console.error(
            "[run-ai] could not read changed run:",
            describeError(error).message,
          );
        });
    });
  }
}

export const runAiChangesService = new RunAiChangesService();
