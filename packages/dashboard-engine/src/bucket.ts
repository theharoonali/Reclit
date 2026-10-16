import type { Bucket } from "./widget";

/**
 * Date buckets, in UTC so a sheet reads the same in every browser and on the
 * server. `start` is the bucket's first instant (what sorts chronologically),
 * `label` is what the axis shows.
 */

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

const DAY_MS = 86_400_000;

/** ISO 8601 week: weeks start on Monday; week 1 holds the year's first Thursday. */
function isoWeek(date: Date): { year: number; week: number; start: number } {
  const day = date.getUTCDay() || 7; // Monday = 1 … Sunday = 7
  const monday = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - (day - 1),
  );
  const thursday = new Date(monday + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = firstThursday.getUTCDay() || 7;
  const week1Monday = Date.UTC(year, 0, 4 - (firstDay - 1));
  const week = Math.round((monday - week1Monday) / (7 * DAY_MS)) + 1;
  return { year, week, start: monday };
}

export function bucketOf(
  date: Date,
  bucket: Exclude<Bucket, "none">,
): { start: number; label: string } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  switch (bucket) {
    case "day":
      return {
        start: Date.UTC(year, month, date.getUTCDate()),
        label: `${year}-${pad(month + 1)}-${pad(date.getUTCDate())}`,
      };
    case "week": {
      const iso = isoWeek(date);
      return { start: iso.start, label: `${iso.year}-W${pad(iso.week)}` };
    }
    case "month":
      return {
        start: Date.UTC(year, month, 1),
        label: `${year}-${pad(month + 1)}`,
      };
    case "quarter": {
      const quarter = Math.floor(month / 3);
      return {
        start: Date.UTC(year, quarter * 3, 1),
        label: `${year}-Q${quarter + 1}`,
      };
    }
    case "year":
      return { start: Date.UTC(year, 0, 1), label: String(year) };
  }
}
