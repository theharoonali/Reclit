import type { SheetLabels, SheetPalette } from "@/lib/ai-spreadsheet/types";

export type DrawCall = { op: string; args: number[]; style: string };

/**
 * A canvas context that records what was drawn instead of drawing it.
 *
 * The painters are pure functions over a `CanvasRenderingContext2D`, so the
 * only way to assert on their output without a browser is to hand them a
 * context that writes down the calls. Text is measured at a flat 7px per
 * character, which keeps expected widths arithmetic rather than font-dependent.
 */
export const CHAR_WIDTH = 7;

export function createRecordingContext() {
  const calls: DrawCall[] = [];
  const state = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "left",
    textBaseline: "middle",
  };
  /** The style a shape is attributed to: strokes stroke, everything else fills. */
  const styleFor = (op: string) =>
    op === "stroke" || op === "strokeRect"
      ? state.strokeStyle
      : state.fillStyle;

  const record =
    (op: string) =>
    (...args: number[]) => {
      calls.push({ op, args, style: styleFor(op) });
    };

  const ctx = {
    // Accessors, not copies: the painters assign to `ctx.fillStyle`, and the
    // recorder has to see that assignment to attribute the next shape to it.
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(value: string) {
      state.fillStyle = value;
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(value: string) {
      state.strokeStyle = value;
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(value: number) {
      state.lineWidth = value;
    },
    get font() {
      return state.font;
    },
    set font(value: string) {
      state.font = value;
    },
    get textAlign() {
      return state.textAlign;
    },
    set textAlign(value: string) {
      state.textAlign = value;
    },
    get textBaseline() {
      return state.textBaseline;
    },
    set textBaseline(value: string) {
      state.textBaseline = value;
    },
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    clip: record("clip"),
    translate: record("translate"),
    fill: record("fill"),
    stroke: record("stroke"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    closePath: record("closePath"),
    rect: record("rect"),
    fillRect: record("fillRect"),
    strokeRect: record("strokeRect"),
    roundRect: record("roundRect"),
    arc: record("arc"),
    setTransform: record("setTransform"),
    measureText: (text: string) => ({ width: text.length * CHAR_WIDTH }),
    fillText: (text: string, x: number, y: number) => {
      calls.push({
        op: `fillText:${text}`,
        args: [x, y],
        style: state.fillStyle,
      });
    },
  } as unknown as CanvasRenderingContext2D;

  return { ctx, calls };
}

/** Every colour distinct and nameable, so an assertion can say which it got. */
export const TEST_PALETTE: SheetPalette = {
  background: "background",
  header: "header",
  headerText: "headerText",
  gutter: "gutter",
  gridline: "gridline",
  text: "text",
  mutedText: "mutedText",
  accent: "accent",
  accentForeground: "accentForeground",
  ring: "ring",
  link: "link",
  invalid: "invalid",
  boolTrue: "boolTrue",
  boolFalse: "boolFalse",
};

export const TEST_LABELS: SheetLabels = {
  boolTrue: "True",
  boolFalse: "False",
  jsonCapsule: (count: number) => `${count} keys`,
  jsonEmpty: "empty",
  typeNames: {} as SheetLabels["typeNames"],
};

export const findCall = (calls: DrawCall[], op: string) =>
  calls.find((call) => call.op === op);

export const textCalls = (calls: DrawCall[]) =>
  calls
    .filter((call) => call.op.startsWith("fillText:"))
    .map((call) => ({ text: call.op.slice("fillText:".length), ...call }));
