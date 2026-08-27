import { beforeEach, describe, expect, test } from "bun:test";
import { createFormatters } from "@/lib/ai-spreadsheet/cell-format";
import {
  CAPSULE_DOT,
  CAPSULE_HEIGHT,
  CAPSULE_PAD_X,
  CELL_PAD_X,
  ROW_HEIGHT,
} from "@/lib/ai-spreadsheet/geometry";
import { paintCell, VOICE_LEADING } from "@/lib/ai-spreadsheet/paint-cell";
import { clearMetricsCache } from "@/lib/ai-spreadsheet/text-metrics";
import type { CellValue, ColumnType } from "@/lib/ai-spreadsheet/types";
import {
  createRecordingContext,
  findCall,
  TEST_LABELS,
  TEST_PALETTE,
  textCalls,
} from "../support/canvas";

const FORMATTERS = createFormatters("en-US");
const RECT = { x: 0, y: 0, w: 160, h: ROW_HEIGHT };

function paint(value: CellValue, type: ColumnType, playing = false) {
  const { ctx, calls } = createRecordingContext();
  paintCell({
    ctx,
    rect: RECT,
    value,
    type,
    palette: TEST_PALETTE,
    labels: TEST_LABELS,
    formatters: FORMATTERS,
    dpr: 1,
    playing,
  });
  return calls;
}

beforeEach(clearMetricsCache);

describe("capsule cells", () => {
  test("a JSON object draws the neutral chip with its key count", () => {
    const calls = paint({ a: 1, b: 2 }, "json");
    expect(findCall(calls, "roundRect")).toBeDefined();
    // `roundRect` only builds the path; the `fill` after it carries the colour.
    expect(findCall(calls, "fill")?.style).toBe("accent");
    expect(textCalls(calls)[0]?.text).toBe("2 keys");
  });

  test("a file draws the neutral chip labelled with its file name", () => {
    const calls = paint("https://example.com/files/resume.pdf", "file");
    const chip = findCall(calls, "roundRect");
    expect(findCall(calls, "fill")?.style).toBe("accent");
    expect(chip?.args[3]).toBe(CAPSULE_HEIGHT);
    expect(textCalls(calls)[0]?.text).toBe("resume.pdf");
  });

  test("true draws a green-bordered chip with a dot and its label", () => {
    const calls = paint(true, "boolean");
    expect(findCall(calls, "roundRect")).toBeDefined();
    expect(findCall(calls, "stroke")?.style).toBe("boolTrue");
    expect(findCall(calls, "arc")?.style).toBe("boolTrue");
    expect(textCalls(calls)[0]?.text).toBe("True");
  });

  test("false draws the same chip in the warning colour", () => {
    const calls = paint(false, "boolean");
    expect(findCall(calls, "stroke")?.style).toBe("boolFalse");
    expect(findCall(calls, "arc")?.style).toBe("boolFalse");
    expect(textCalls(calls)[0]?.text).toBe("False");
  });

  test("the boolean dot sits inside the chip, before the label", () => {
    const calls = paint(true, "boolean");
    const chip = findCall(calls, "roundRect");
    const dot = findCall(calls, "arc");
    const label = textCalls(calls)[0];
    const chipX = chip?.args[0] ?? 0;
    const dotX = dot?.args[0] ?? 0;
    // Centre of the dot, then the label clear of it.
    expect(dotX).toBeGreaterThan(chipX);
    expect(label?.args[0]).toBeGreaterThan(dotX + CAPSULE_DOT / 2);
    // Vertically centred on the row.
    expect(dot?.args[1]).toBe(ROW_HEIGHT / 2);
  });

  test("every capsule starts at the same x, so the column reads as a column", () => {
    const json = findCall(paint({ a: 1 }, "json"), "roundRect");
    const file = findCall(paint("https://e.com/a.pdf", "file"), "roundRect");
    const bool = findCall(paint(true, "boolean"), "roundRect");
    const voice = findCall(paint("https://e.com/a.mp3", "voice"), "roundRect");
    expect(json?.args[0]).toBe(CELL_PAD_X);
    expect(file?.args[0]).toBe(CELL_PAD_X);
    expect(bool?.args[0]).toBe(CELL_PAD_X);
    expect(voice?.args[0]).toBe(CELL_PAD_X);
  });
});

describe("voice cells", () => {
  const URL = "https://example.com/voice/intro.mp3";

  test("idle draws a play triangle and the file name", () => {
    const calls = paint(URL, "voice");
    expect(findCall(calls, "roundRect")).toBeDefined();
    // A triangle is three points and a close, not a rect.
    expect(findCall(calls, "moveTo")).toBeDefined();
    expect(findCall(calls, "closePath")).toBeDefined();
    expect(textCalls(calls)[0]?.text).toBe("intro.mp3");
  });

  test("playing draws two pause bars instead, in the accent colour", () => {
    const calls = paint(URL, "voice", true);
    expect(findCall(calls, "moveTo")).toBeUndefined();
    const bars = calls.filter((call) => call.op === "rect");
    expect(bars).toHaveLength(2);
    expect(bars[0]?.style).toBe("ring");
    expect(findCall(calls, "stroke")?.style).toBe("ring");
  });

  test("the chip is the same size playing or not, so its hit region holds", () => {
    const idle = findCall(paint(URL, "voice"), "roundRect");
    const playing = findCall(paint(URL, "voice", true), "roundRect");
    expect(playing?.args).toEqual(idle?.args ?? []);
  });

  test("the control leaves room for the label, and the label clears it", () => {
    const calls = paint(URL, "voice");
    const chip = findCall(calls, "roundRect");
    const label = textCalls(calls)[0];
    expect(label?.args[0]).toBe(
      (chip?.args[0] ?? 0) + CAPSULE_PAD_X + VOICE_LEADING,
    );
  });

  test("a non-url in a voice column is painted as invalid text", () => {
    const calls = paint("intro.mp3", "voice");
    expect(findCall(calls, "roundRect")).toBeUndefined();
    expect(textCalls(calls)[0]?.style).toBe("invalid");
  });

  test("a blank voice cell paints nothing", () => {
    expect(paint(null, "voice")).toHaveLength(0);
  });
});

describe("values that do not match their column", () => {
  test("a non-url in a file column is painted as invalid text, not a chip", () => {
    const calls = paint("resume.pdf", "file");
    expect(findCall(calls, "roundRect")).toBeUndefined();
    expect(textCalls(calls)[0]).toMatchObject({
      text: "resume.pdf",
      style: "invalid",
    });
  });

  test("a string in a boolean column is painted as invalid text", () => {
    const calls = paint("yes", "boolean");
    expect(findCall(calls, "roundRect")).toBeUndefined();
    expect(textCalls(calls)[0]?.style).toBe("invalid");
  });

  test("a string in a json column is painted as invalid text", () => {
    const calls = paint("nope", "json");
    expect(findCall(calls, "roundRect")).toBeUndefined();
    expect(textCalls(calls)[0]?.style).toBe("invalid");
  });
});

describe("plain cells", () => {
  test("a blank cell paints nothing at all", () => {
    expect(paint(null, "string")).toHaveLength(0);
    expect(paint(null, "json")).toHaveLength(0);
    expect(paint(null, "boolean")).toHaveLength(0);
  });

  test("text is painted in the text colour from the padding edge", () => {
    const calls = paint("Muhammad", "string");
    expect(textCalls(calls)[0]).toMatchObject({
      text: "Muhammad",
      style: "text",
    });
    expect(textCalls(calls)[0]?.args[0]).toBe(CELL_PAD_X);
  });

  test("email and url are painted in the link colour", () => {
    expect(textCalls(paint("a@b.com", "email"))[0]?.style).toBe("link");
    expect(textCalls(paint("https://b.com", "url"))[0]?.style).toBe("link");
  });

  test("a date is painted formatted, in UTC", () => {
    const calls = paint("2026-08-27T23:30:00.000Z", "date");
    expect(textCalls(calls)[0]?.text).toBe("Aug 27, 2026");
  });
});
