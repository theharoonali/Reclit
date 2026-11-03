import { LiveFeed, type LiveFeedNotice } from "../../common/live-feed";

// The dashboard-generation change feed: one `LiveFeed` (src/common/live-feed.ts)
// on the channel the `ai_run_notify` trigger publishes `DASHBOARD` runs to
// (migration `consolidate_tables`). dashboard-generation-changes.service.ts
// resolves the ids it emits into rows.

export const DASHBOARD_GENERATION_CHANNEL = "dashboard_generation_changed";

export type GenerationFeedNotice = LiveFeedNotice;

export const dashboardGenerationFeed = new LiveFeed(
  DASHBOARD_GENERATION_CHANNEL,
  "dashboard-generation",
);
