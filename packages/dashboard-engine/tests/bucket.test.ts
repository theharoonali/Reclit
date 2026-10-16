import { describe, expect, it } from "bun:test";
import { bucketOf } from "../src/index";

const at = (iso: string) => new Date(iso);

describe("bucketOf", () => {
  it("labels day, month, quarter and year in UTC", () => {
    const date = at("2026-08-31T23:30:00.000Z");
    expect(bucketOf(date, "day")).toEqual({
      start: Date.UTC(2026, 7, 31),
      label: "2026-08-31",
    });
    expect(bucketOf(date, "month")).toEqual({
      start: Date.UTC(2026, 7, 1),
      label: "2026-08",
    });
    expect(bucketOf(date, "quarter")).toEqual({
      start: Date.UTC(2026, 6, 1),
      label: "2026-Q3",
    });
    expect(bucketOf(date, "year")).toEqual({
      start: Date.UTC(2026, 0, 1),
      label: "2026",
    });
  });

  it("buckets ISO weeks, Monday-based, with the ISO year", () => {
    // 2026-01-01 is a Thursday: week 1 of 2026 starts Monday 2025-12-29.
    expect(bucketOf(at("2026-01-01T12:00:00.000Z"), "week")).toEqual({
      start: Date.UTC(2025, 11, 29),
      label: "2026-W01",
    });
    expect(bucketOf(at("2025-12-29T00:00:00.000Z"), "week").label).toBe(
      "2026-W01",
    );
    // 2026 has 53 ISO weeks; 2027-01-01 (a Friday) is still 2026-W53.
    expect(bucketOf(at("2027-01-01T00:00:00.000Z"), "week").label).toBe(
      "2026-W53",
    );
    // 2024-12-30 (a Monday) opens 2025-W01.
    expect(bucketOf(at("2024-12-30T00:00:00.000Z"), "week").label).toBe(
      "2025-W01",
    );
    // A Sunday belongs to the week that started the previous Monday.
    expect(bucketOf(at("2026-03-08T00:00:00.000Z"), "week")).toEqual({
      start: Date.UTC(2026, 2, 2),
      label: "2026-W10",
    });
  });

  it("sorts chronologically by start", () => {
    const march = bucketOf(at("2026-03-01T00:00:00.000Z"), "month").start;
    const april = bucketOf(at("2026-04-01T00:00:00.000Z"), "month").start;
    expect(march).toBeLessThan(april);
  });
});
