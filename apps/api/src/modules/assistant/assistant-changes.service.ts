import { EventEmitter, on } from "node:events";
import { describeError } from "../../common/errors";
import type { AssistantFeedNotice } from "./assistant.feed";
import { assistantFeed } from "./assistant.feed";
import type {
  AssistantChange,
  AssistantChangesInput,
  AssistantEvent,
  AssistantRun,
} from "./assistant.schema";
import { isTerminalAssistantStatus } from "./assistant.schema";
import { assistantService } from "./assistant.service";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The `assistant.onChange`
// stream, the run-ai stream's twin scoped by workspace: feed notices (row ids)
// are resolved into rows once per process and re-emitted, and `changes()`
// turns them into one workspace's replay + snapshot + live events. Reads go
// through `assistantService`; nothing here writes.

/** The SSE event id: the row's `updatedAt` in ms, so replay is a range query. */
const eventId = (run: AssistantRun) => String(run.updatedAt.getTime());

/** "0" replays everything; anything unparsable replays nothing. */
function parseEventId(id: string | null | undefined): Date | null {
  if (id === null || id === undefined || id === "") return null;
  const ms = Number(id);
  return Number.isFinite(ms) && ms >= 0 ? new Date(ms) : null;
}

const runEvent = (run: AssistantRun): AssistantEvent => ({
  id: eventId(run),
  change: { type: "run", run },
});

type LiveChange = { kind: "run"; run: AssistantRun } | { kind: "resync" };

export class AssistantChangesService {
  /** Resolved changes, emitted as `"change"` with a `LiveChange`. */
  private readonly events = new EventEmitter();
  private pumping = false;

  constructor() {
    this.events.setMaxListeners(0);
  }

  /**
   * The stream for one workspace: a replay of everything since `lastEventId`
   * (when reconnecting), then a snapshot of the active run, then every change
   * as it happens — until a terminal change leaves the workspace with no
   * active run, when `closed` is the last event and the stream ends (a
   * generation, not a socket; the capsule reopens it when the next run
   * starts). Subscribes to the live feed *before* reading, so nothing can slip
   * between the snapshot and the first live event. Also ends when `signal`
   * aborts (client gone).
   */
  async *changes(
    input: AssistantChangesInput,
    signal?: AbortSignal,
  ): AsyncGenerator<AssistantEvent, void, undefined> {
    await assistantFeed.ensureStarted();
    this.ensurePump();
    const live = on(this.events, "change", { signal }) as AsyncIterableIterator<
      [LiveChange]
    >;
    try {
      const since = parseEventId(input.lastEventId);
      if (since) {
        for (const run of await assistantService.listChangedSince(
          input.workspaceId,
          since,
        )) {
          yield runEvent(run);
        }
      }
      yield await this.snapshot(input.workspaceId);
      for await (const [change] of live) {
        if (change.kind === "resync") {
          yield await this.snapshot(input.workspaceId);
          continue;
        }
        const run = change.run;
        if (run.workspaceId !== input.workspaceId) continue;
        yield runEvent(run);
        if (!isTerminalAssistantStatus(run.status)) continue;
        const active = await assistantService.active(input.workspaceId);
        if (active === null) {
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
   * Tracked by the newest `updatedAt` of the workspace, so a reconnect
   * replays from a database timestamp rather than this process's clock.
   */
  private async snapshot(workspaceId: string): Promise<AssistantEvent> {
    const [run, id] = await Promise.all([
      assistantService.active(workspaceId),
      assistantService.latestEventId(workspaceId),
    ]);
    const change: AssistantChange = { type: "snapshot", run };
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
    assistantFeed.events.on("notice", (notice: AssistantFeedNotice) => {
      if (notice.kind === "resync") {
        this.events.emit("change", { kind: "resync" } satisfies LiveChange);
        return;
      }
      assistantService
        .find(notice.id)
        .then((run) => {
          if (run) this.events.emit("change", { kind: "run", run });
        })
        .catch((error: unknown) => {
          console.error(
            "[assistant] could not read changed run:",
            describeError(error).message,
          );
        });
    });
  }
}

export const assistantChangesService = new AssistantChangesService();
