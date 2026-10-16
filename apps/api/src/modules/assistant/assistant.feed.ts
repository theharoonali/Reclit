import { LiveFeed, type LiveFeedNotice } from "../../common/live-feed";

// The `AssistantRun` change feed: one `LiveFeed` (src/common/live-feed.ts)
// on the channel the `assistant_run_notify` trigger publishes to (migration
// `add_assistant_run`). assistant-changes.service.ts resolves the ids it
// emits into rows.

export const ASSISTANT_CHANNEL = "assistant_run_changed";

export type AssistantFeedNotice = LiveFeedNotice;

export const assistantFeed = new LiveFeed(ASSISTANT_CHANNEL, "assistant");
