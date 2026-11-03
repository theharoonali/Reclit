import { describe, expect, it } from "bun:test";
import {
  ANGLED_TICK_HEIGHT,
  axisWidthFor,
  CATEGORY_AXIS_MAX_PX,
  compactFigure,
  FLAT_TICK_HEIGHT,
  MAX_FLAT_TICK_CHARS,
  MAX_TICK_CHARS,
  seriesValues,
  TICK_ANGLE,
  tickLayout,
  tickPolicy,
  tooltipCategory,
  truncateLabel,
  VALUE_AXIS_MAX_PX,
  VALUE_AXIS_MIN_PX,
  valueAxisWidth,
} from "@/lib/dashboard/axis";

const labels = (count: number, length: number) =>
  Array.from({ length: count }, (_, i) =>
    `${i}`.padEnd(length, "x").slice(0, length),
  );

describe("truncateLabel", () => {
  it("leaves a label at or under the limit alone", () => {
    expect(truncateLabel("North")).toBe("North");
    expect(truncateLabel("Twelve chars")).toBe("Twelve chars");
  });

  it("cuts a longer label to the limit, ending in an ellipsis", () => {
    const cut = truncateLabel("Northern Territories");
    expect(cut).toBe("Northern Te…");
    expect(cut.length).toBe(MAX_TICK_CHARS);
    expect(truncateLabel("United Kingdom", 8)).toBe("United…");
  });
});

describe("compactFigure", () => {
  it("abbreviates thousands and millions to one decimal", () => {
    expect(compactFigure(1200)).toBe("1.2K");
    expect(compactFigure(1000)).toBe("1K");
    expect(compactFigure(3_400_000)).toBe("3.4M");
    expect(compactFigure(12_345)).toBe("12.3K");
  });

  it("leaves small integers unchanged and handles negatives", () => {
    expect(compactFigure(0)).toBe("0");
    expect(compactFigure(999)).toBe("999");
    expect(compactFigure(-1500)).toBe("-1.5K");
    expect(compactFigure(-42)).toBe("-42");
  });

  it("is blank for a non-finite value", () => {
    expect(compactFigure(Number.NaN)).toBe("");
    expect(compactFigure(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("axisWidthFor", () => {
  it("grows with the longest tick and clamps to the value axis range", () => {
    expect(axisWidthFor(["0", "10"])).toBe(VALUE_AXIS_MIN_PX);
    expect(axisWidthFor(["$1.2M", "0"])).toBe(5 * 7 + 12);
    expect(axisWidthFor(["a very long tick label"])).toBe(VALUE_AXIS_MAX_PX);
    expect(axisWidthFor([])).toBe(VALUE_AXIS_MIN_PX);
  });

  it("takes a wider ceiling for a category axis", () => {
    const wide = axisWidthFor(["Northern Territories, Australia"], {
      max: CATEGORY_AXIS_MAX_PX,
    });
    expect(wide).toBe(CATEGORY_AXIS_MAX_PX);
    expect(axisWidthFor(["Berlin"], { max: CATEGORY_AXIS_MAX_PX })).toBe(
      6 * 7 + 12,
    );
  });
});

describe("valueAxisWidth", () => {
  it("sizes to the compact extremes, always spanning zero", () => {
    expect(valueAxisWidth([5, 99])).toBe(VALUE_AXIS_MIN_PX);
    expect(valueAxisWidth([5, 120])).toBe(axisWidthFor(["120"]));
    expect(valueAxisWidth([1_250_000, 300])).toBe(axisWidthFor(["1.3M"]));
    expect(valueAxisWidth([-12_500, 8])).toBe(axisWidthFor(["-12.5K"]));
  });

  it("falls back to the minimum with nothing to measure", () => {
    expect(valueAxisWidth([])).toBe(VALUE_AXIS_MIN_PX);
    expect(valueAxisWidth([Number.NaN])).toBe(VALUE_AXIS_MIN_PX);
  });
});

describe("seriesValues", () => {
  const rows = [
    { month: "Jan", a: 10, b: 5 },
    { month: "Feb", a: null, b: "7" },
    { month: "Mar", a: "n/a", b: 1 },
  ];

  it("lists every series value, blanks and text as zero", () => {
    expect(seriesValues(rows, ["a", "b"])).toEqual([10, 5, 0, 7, 0, 1]);
  });

  it("totals each record when stacked", () => {
    expect(seriesValues(rows, ["a", "b"], { stacked: true })).toEqual([
      15, 7, 1,
    ]);
  });
});

describe("tickLayout", () => {
  it("keeps few or short labels flat on one line", () => {
    expect(tickLayout(labels(6, 10))).toEqual({
      angle: 0,
      height: FLAT_TICK_HEIGHT,
      interval: 0,
      maxChars: MAX_FLAT_TICK_CHARS,
    });
    expect(tickLayout(labels(12, 6)).angle).toBe(0);
  });

  it("slants many long labels on a taller axis with more room each", () => {
    expect(tickLayout(labels(7, 7))).toEqual({
      angle: TICK_ANGLE,
      height: ANGLED_TICK_HEIGHT,
      interval: 0,
      maxChars: MAX_TICK_CHARS,
    });
  });

  it("thins the ticks to the ends past sixteen labels", () => {
    expect(tickLayout(labels(16, 3)).interval).toBe(0);
    expect(tickLayout(labels(17, 3)).interval).toBe("preserveStartEnd");
  });
});

describe("tickPolicy", () => {
  it("lays categories along the bottom while they fit", () => {
    expect(tickPolicy(labels(8, 5), 6)).toMatchObject({
      orientation: "vertical",
      angle: 0,
    });
    expect(tickPolicy(labels(16, 5), 12)).toMatchObject({
      orientation: "vertical",
    });
  });

  it("turns horizontal past eight labels, or sixteen on a full-width card", () => {
    expect(tickPolicy(labels(9, 5), 6)).toEqual({ orientation: "horizontal" });
    expect(tickPolicy(labels(9, 5), 12)).toMatchObject({
      orientation: "vertical",
    });
    expect(tickPolicy(labels(17, 5), 12)).toEqual({
      orientation: "horizontal",
    });
  });

  it("turns horizontal when labels average more than ten characters", () => {
    expect(
      tickPolicy(["Northern Territories", "Queensland", "Tas"], 12),
    ).toEqual({ orientation: "horizontal" });
    expect(tickPolicy(["Queensland", "Tasmania"], 12).orientation).toBe(
      "vertical",
    );
    expect(tickPolicy([], 6).orientation).toBe("vertical");
  });
});

describe("tooltipCategory", () => {
  it("names the hovered record's category, whatever the tick showed", () => {
    const heading = tooltipCategory("region");
    expect(
      heading("Northern…", [{ payload: { region: "Northern Rivers" } }]),
    ).toBe("Northern Rivers");
    expect(heading(2024, [{ payload: { region: 2024 } }])).toBe("2024");
  });

  it("is blank without a category or a record", () => {
    expect(tooltipCategory("region")("x", [])).toBe("");
    expect(
      tooltipCategory("region")("x", [{ payload: { region: null } }]),
    ).toBe("");
    expect(
      tooltipCategory(undefined)("x", [{ payload: { region: "A" } }]),
    ).toBe("");
  });
});
