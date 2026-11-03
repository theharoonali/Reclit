import { EventEmitter, on } from "node:events";
import type { LiveFeedNotice } from "../../common/live-feed";
import { companyFeed } from "./company.feed";
import type { Company } from "./company.schema";
import { companyService } from "./company.service";

// Framework-free (docs/rules/BACKEND.md hard rule 1). The `company.onChange`
// stream. Simpler than the run-ai / assistant streams: the subject is one
// row per user, so there is nothing to replay — every event is the whole
// profile as it is now, and a reconnect simply starts with it again.

export class CompanyChangesService {
  /** Feed notices re-emitted as `"change"` with the company id, or `null` for a resync. */
  private readonly events = new EventEmitter();
  private pumping = false;

  constructor() {
    this.events.setMaxListeners(0);
  }

  /**
   * The current user's company now, then again after every change to it or
   * to one of its documents. Subscribes before the first read, so nothing
   * slips between the two; a change that leaves the profile as it was sent
   * last is not sent twice. Ends when `signal` aborts.
   */
  async *changes(signal?: AbortSignal): AsyncGenerator<Company, void> {
    await companyFeed.ensureStarted();
    this.ensurePump();
    const live = on(this.events, "change", { signal }) as AsyncIterableIterator<
      [string | null]
    >;
    try {
      let company = await companyService.me();
      let last = JSON.stringify(company);
      yield company;
      for await (const [id] of live) {
        if (id !== null && id !== company.id) continue;
        const next = await companyService.find(company.id);
        if (!next) continue;
        const shape = JSON.stringify(next);
        if (shape === last) continue;
        company = next;
        last = shape;
        yield company;
      }
    } catch (error) {
      // `on()` rejects with AbortError when the signal fires: the normal end.
      if (signal?.aborted) return;
      throw error;
    } finally {
      await live.return?.();
    }
  }

  private ensurePump() {
    if (this.pumping) return;
    this.pumping = true;
    companyFeed.events.on("notice", (notice: LiveFeedNotice) => {
      this.events.emit("change", notice.kind === "resync" ? null : notice.id);
    });
  }
}

export const companyChangesService = new CompanyChangesService();
