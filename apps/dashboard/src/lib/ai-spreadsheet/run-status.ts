/**
 * A run's status is a lowercase word from the API (see the run-ai contract):
 * `pending`, `running`, `completed`, `failed`, or a custom working stage such
 * as `analyzing` or `web_search`. The known four are copy and come from
 * next-intl; a custom stage is data the backend chose, so it is shown as
 * itself, tidied — never invented and never translated.
 */

export const KNOWN_RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;
export type KnownRunStatus = (typeof KNOWN_RUN_STATUSES)[number];

export const isKnownRunStatus = (status: string): status is KnownRunStatus =>
  (KNOWN_RUN_STATUSES as readonly string[]).includes(status);

/** The only statuses that end a run; everything else is "working". */
export const isTerminalRunStatus = (status: string): boolean =>
  status === "completed" || status === "failed";

/** "analyzing" -> "Analyzing", "web_search" -> "Web search". */
export function formatRunStatus(status: string): string {
  const words = status.trim().replace(/[_-]+/g, " ").toLowerCase();
  if (words === "") return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
