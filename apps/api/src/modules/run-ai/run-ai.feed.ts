import { LiveFeed, type LiveFeedNotice } from "../../common/live-feed";

// The `RunAi` change feed: one `LiveFeed` (src/common/live-feed.ts) on the
// channel the `run_ai_notify` trigger publishes to (migration
// `run_ai_status_text_and_feed`). run-ai-changes.service.ts resolves the ids
// it emits into rows.

export const RUN_AI_CHANNEL = "run_ai_changed";

export type RunAiFeedNotice = LiveFeedNotice;

export const runAiFeed = new LiveFeed(RUN_AI_CHANNEL, "run-ai");
