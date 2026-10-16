import { describe, expect, it } from "bun:test";
import { formatFigure } from "@/lib/dashboard/format";
import { heatLevel, toChartConfig } from "@/lib/dashboard/layout";

describe("toChartConfig", () => {
  it("maps series to labels and token colours", () => {
    expect(
      toChartConfig([
        { key: "done", label: "Done", color: "chart-3" },
        { key: "target", label: "Target" },
      ]),
    ).toEqual({
      done: { label: "Done", color: "hsl(var(--chart-3))" },
      target: { label: "Target", color: "hsl(var(--chart-1))" },
    });
  });
});

describe("heatLevel", () => {
  it("buckets 0–100 into five steps by default", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(19)).toBe(0);
    expect(heatLevel(20)).toBe(1);
    expect(heatLevel(59)).toBe(2);
    expect(heatLevel(80)).toBe(4);
    expect(heatLevel(100)).toBe(4);
  });

  it("scales to the widget's largest value", () => {
    expect(heatLevel(5, 10)).toBe(2);
    expect(heatLevel(10, 10)).toBe(4);
    expect(heatLevel("2", 10)).toBe(1);
  });

  it("treats blanks, text and a zero max as the lowest step", () => {
    expect(heatLevel(null)).toBe(0);
    expect(heatLevel(undefined)).toBe(0);
    expect(heatLevel("n/a")).toBe(0);
    expect(heatLevel(50, 0)).toBe(0);
  });
});

describe("formatFigure", () => {
  it("localises numbers and wraps them in the series' prefix and suffix", () => {
    expect(formatFigure(53111, { prefix: "$" })).toBe("$53,111");
    expect(formatFigure(57, { suffix: "%" })).toBe("57%");
    expect(formatFigure(1234.5)).toBe((1234.5).toLocaleString());
  });

  it("passes text through and leaves blanks blank", () => {
    expect(formatFigure("Ann", { prefix: "$" })).toBe("$Ann");
    expect(formatFigure(null, { suffix: "%" })).toBe("");
    expect(formatFigure(undefined)).toBe("");
    expect(formatFigure("")).toBe("");
  });
});
