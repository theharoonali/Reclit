import { LiveFeed, type LiveFeedNotice } from "../../common/live-feed";

// The `DashboardGeneration` change feed: one `LiveFeed` (src/common/live-feed.ts)
// on the channel the `dashboard_generation_notify` trigger publishes to
// (migration `add_dashboard_generation`). dashboard-generation-changes.service.ts
// resolves the ids it emits into rows.

export const DASHBOARD_GENERATION_CHANNEL = "dashboard_generation_changed";

export type GenerationFeedNotice = LiveFeedNotice;

export const dashboardGenerationFeed = new LiveFeed(
  DASHBOARD_GENERATION_CHANNEL,
  "dashboard-generation",
);
