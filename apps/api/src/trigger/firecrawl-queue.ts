import { queue } from "@trigger.dev/sdk";

// The one queue every Firecrawl crawl runs on — a cell's url (`crawl-website`)
// and the company website (`crawl-company`). One at a time: the Firecrawl
// free plan allows one concurrent crawl and two starts a minute, whichever
// task asks.

export const firecrawlQueue = queue({ name: "firecrawl", concurrencyLimit: 1 });
