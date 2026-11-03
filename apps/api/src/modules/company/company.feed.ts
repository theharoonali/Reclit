import { LiveFeed } from "../../common/live-feed";

// The company change feed: one `LiveFeed` (src/common/live-feed.ts) on the
// channel the `company_notify` / `company_document_notify` triggers publish
// the company id to (migration `add_company`). company-changes.service.ts
// re-reads the profile on every notice.

export const COMPANY_CHANNEL = "company_changed";

export const companyFeed = new LiveFeed(COMPANY_CHANNEL, "company");
