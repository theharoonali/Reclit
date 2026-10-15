import dashboardJson from "./dashboard.json";
import { type Dashboard, dashboardSchema } from "./dashboard.schema";

/**
 * The dashboard's one data source until an API serves it. Every widget on `/`
 * comes from `dashboard.json`, validated against `dashboardSchema` on first
 * read — a malformed entry throws with the offending path rather than
 * rendering a blank card. When the backend exists this becomes a query that
 * returns the same `Dashboard` type, and nothing downstream changes.
 */
let cached: Dashboard | null = null;

export function getDashboard(): Dashboard {
  cached ??= dashboardSchema.parse(dashboardJson);
  return cached;
}
