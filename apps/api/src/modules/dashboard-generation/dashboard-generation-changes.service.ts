import { EventEmitter, on } from "node:events";
import { describeError } from "../../common/errors";
import type { GenerationFeedNotice } from "./dashboard-generation.feed";
import { dashboardGenerationFeed } from "./dashboard-generation.feed";
import type {
  DashboardGeneration,
  GenerationChange,
  GenerationChangesInput,
  GenerationEvent,
} from "./dashboard-generation.schema";
import { isTerminalGenerationStatus } from "./dashboard-generation.schema";
import { dashboardGenerationService } from "./dashboard-generation.service";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The
// `dashboardGeneration.onChange` stream, the assistant stream's twin: feed
// notices (row ids) are resolved into rows once per process and re-emitted,
// and `changes()` turns them into one workspace's replay + snapshot + live
// events. Reads go through `dashboardGenerationService`; nothing here writes.

/** The SSE event id: the row's `updatedAt` in ms, so replay is a range query. */
const eventId = (generation: DashboardGeneration) =>
  String(generation.updatedAt.getTime());

/** "0" replays everything; anything unparsable replays nothing. */
function parseEventId(id: string | null | undefined): Date | null {
  if (id === null || id === undefined || id === "") return null;
  const ms = Number(id);
  return Number.isFinite(ms) && ms >= 0 ? new Date(ms) : null;
}

const generationEvent = (generation: DashboardGeneration): GenerationEvent => ({
  id: eventId(generation),
  change: { type: "generation", generation },
});

type LiveChange =
  | { kind: "generation"; generation: DashboardGeneration }
  | { kind: "resync" };

export class DashboardGenerationChangesService {
  /** Resolved changes, emitted as `"change"` with a `LiveChange`. */
  private readonly events = new EventEmitter();
  private pumping = false;

  constructor() {
    this.events.setMaxListeners(0);
  }

  /**
   * The stream for one workspace: a replay of everything since `lastEventId`
   * (when reconnecting), then a snapshot of the active generation, then every
   * change as it happens — until a terminal change leaves the workspace with
   * no active generation, when `closed` is the last event and the stream ends.
   * Subscribes to the live feed *before* reading, so nothing can slip between
   * the snapshot and the first live event. Also ends when `signal` aborts.
   */
  async *changes(
    input: GenerationChangesInput,
    signal?: AbortSignal,
  ): AsyncGenerator<GenerationEvent, void, undefined> {
    await dashboardGenerationFeed.ensureStarted();
    this.ensurePump();
    const live = on(this.events, "change", { signal }) as AsyncIterableIterator<
      [LiveChange]
    >;
    try {
      let seen = parseEventId(input.lastEventId);
      const sent = (event: GenerationEvent) => {
        const at = parseEventId(event.id);
        if (at && (!seen || at > seen)) seen = at;
        return event;
      };
      for (const event of await this.catchUp(input.workspaceId, seen)) {
        yield sent(event);
      }
      for await (const [change] of live) {
        if (change.kind === "resync") {
          for (const event of await this.catchUp(input.workspaceId, seen)) {
            yield sent(event);
          }
          continue;
        }
        const generation = change.generation;
        if (generation.workspaceId !== input.workspaceId) continue;
        yield sent(generationEvent(generation));
        if (!isTerminalGenerationStatus(generation.status)) continue;
        const active = await dashboardGenerationService.active(
          input.workspaceId,
        );
        if (active === null) {
          yield { id: eventId(generation), change: { type: "closed" } };
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

  private async catchUp(
    workspaceId: string,
    since: Date | null,
  ): Promise<GenerationEvent[]> {
    const missed = since
      ? await dashboardGenerationService.listChangedSince(workspaceId, since)
      : [];
    return [...missed.map(generationEvent), await this.snapshot(workspaceId)];
  }

  private async snapshot(workspaceId: string): Promise<GenerationEvent> {
    const [generation, id] = await Promise.all([
      dashboardGenerationService.active(workspaceId),
      dashboardGenerationService.latestEventId(workspaceId),
    ]);
    const change: GenerationChange = { type: "snapshot", generation };
    return { id, change };
  }

  /** One listener per process resolves feed notices into rows and re-emits them. */
  private ensurePump() {
    if (this.pumping) return;
    this.pumping = true;
    dashboardGenerationFeed.events.on(
      "notice",
      (notice: GenerationFeedNotice) => {
        if (notice.kind === "resync") {
          this.events.emit("change", { kind: "resync" } satisfies LiveChange);
          return;
        }
        dashboardGenerationService
          .find(notice.id)
          .then((generation) => {
            if (generation) {
              this.events.emit("change", { kind: "generation", generation });
            }
          })
          .catch((error: unknown) => {
            console.error(
              "[dashboard-generation] could not read changed generation:",
              describeError(error).message,
            );
          });
      },
    );
  }
}

export const dashboardGenerationChangesService =
  new DashboardGenerationChangesService();
