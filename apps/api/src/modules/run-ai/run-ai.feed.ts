import { LiveFeed, type LiveFeedNotice } from "../../common/live-feed";

// The cell-run change feed: one `LiveFeed` (src/common/live-feed.ts) on the
// channel the `ai_run_notify` trigger publishes `CELL` runs to (migration
// `consolidate_tables`). run-ai-changes.service.ts resolves the ids it emits
// into rows.

export const RUN_AI_CHANNEL = "run_ai_changed";

export type RunAiFeedNotice = LiveFeedNotice;

export const runAiFeed = new LiveFeed(RUN_AI_CHANNEL, "run-ai");
