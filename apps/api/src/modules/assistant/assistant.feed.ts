import { LiveFeed, type LiveFeedNotice } from "../../common/live-feed";

// The assistant-run change feed: one `LiveFeed` (src/common/live-feed.ts)
// on the channel the `ai_run_notify` trigger publishes `ASSISTANT` runs to
// (migration `consolidate_tables`). assistant-changes.service.ts resolves the
// ids it emits into rows.

export const ASSISTANT_CHANNEL = "assistant_run_changed";

export type AssistantFeedNotice = LiveFeedNotice;

export const assistantFeed = new LiveFeed(ASSISTANT_CHANNEL, "assistant");
