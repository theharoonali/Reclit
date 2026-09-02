import {
  fileLabel,
  formatCellText,
  isJsonObject,
  isMistyped,
  isResourceUrl,
} from "./cell-format";
import {
  CAPSULE_DOT,
  CAPSULE_DOT_GAP,
  CAPSULE_GLYPH,
  CAPSULE_HEIGHT,
  CAPSULE_PAD_X,
  CAPSULE_PULSE_MAX,
  CELL_PAD_X,
  COL_WIDTH,
  type Rect,
  ROW_HEIGHT,
} from "./geometry";
import { measureWidth, truncateToWidth } from "./text-metrics";
import { withAlpha } from "./theme-colors";
import type {
  CellValue,
  ColumnType,
  SheetFormatters,
  SheetLabels,
  SheetPalette,
} from "./types";

/**
 * The mark a capsule can carry before its label: a boolean's status dot, a
 * working run's pulsing dot, or a audio cell's transport control.
 *
 * A audio chip reserves the same width whether it is showing play or pause, so
 * the chip does not change size — and so its clickable region does not move —
 * when playback starts. The pulse reserves the dot's width for the same
 * reason: only its halo breathes, never the label.
 */
export type CapsuleMark = "dot" | "pulse" | "play" | "pause";

export const capsuleLeading = (mark?: CapsuleMark) => {
  if (!mark) return 0;
  const width =
    mark === "dot" || mark === "pulse" ? CAPSULE_DOT : CAPSULE_GLYPH;
  return width + CAPSULE_DOT_GAP;
};

/** What a audio chip reserves, whichever way round its control is drawn. */
export const AUDIO_LEADING = capsuleLeading("play");

/**
 * The bounds of a capsule inside its cell. Exported because the pointer
 * hit-test uses *this* function rather than re-deriving the geometry — the
 * chip you can click is by construction the chip that was drawn.
 *
 * `rect` is the cell in content space. `leading` is the space reserved before
 * the label, which only the boolean capsule's dot uses.
 */
export function capsuleRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  label: string,
  leading = 0,
): Rect {
  const natural = measureWidth(ctx, label) + leading + CAPSULE_PAD_X * 2;
  return {
    x: rect.x + CELL_PAD_X,
    y: rect.y + (ROW_HEIGHT - CAPSULE_HEIGHT) / 2,
    w: Math.min(natural, COL_WIDTH - CELL_PAD_X * 2),
    h: CAPSULE_HEIGHT,
  };
}

/**
 * How a capsule is inked. JSON and file cells share the neutral accent chip;
 * booleans get a coloured border and a matching dot instead, which is what
 * makes true and false readable at a glance without reading the word. Audio
 * cells reuse the neutral chip and add a play/pause control. A working run
 * takes the boolean construction in its status colour, tints the fill, and
 * breathes a halo behind the dot.
 */
type CapsuleStyle = {
  fill: string;
  border: string;
  borderWidth: number;
  text: string;
  mark?: { kind: CapsuleMark; color: string };
};

/** How far through one breath the pulse halo is, 0..1. */
const PULSE_HALO_ALPHA = 0.3;

/** The halo's radius at `phase`: from the dot's own radius up to the max. */
export function pulseHaloRadius(phase: number): number {
  const min = CAPSULE_DOT / 2;
  const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  return min + (CAPSULE_PULSE_MAX - min) * wave;
}

/** The leading mark, drawn centred in the width `capsuleLeading` reserved. */
function paintMark(
  ctx: CanvasRenderingContext2D,
  mark: { kind: CapsuleMark; color: string },
  x: number,
  centerY: number,
  phase: number,
) {
  ctx.fillStyle = mark.color;
  ctx.beginPath();

  if (mark.kind === "dot") {
    ctx.arc(x + CAPSULE_DOT / 2, centerY, CAPSULE_DOT / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (mark.kind === "pulse") {
    // The halo first, translucent and breathing; then the dot itself, solid
    // and the same size on every frame.
    const cx = x + CAPSULE_DOT / 2;
    ctx.fillStyle = withAlpha(mark.color, PULSE_HALO_ALPHA);
    ctx.arc(cx, centerY, pulseHaloRadius(phase), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mark.color;
    ctx.beginPath();
    ctx.arc(cx, centerY, CAPSULE_DOT / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const half = CAPSULE_GLYPH / 2;
  if (mark.kind === "play") {
    // A triangle inset a little on the vertical, so it reads as an arrow
    // rather than filling the chip's whole height.
    ctx.moveTo(x, centerY - half);
    ctx.lineTo(x + CAPSULE_GLYPH, centerY);
    ctx.lineTo(x, centerY + half);
    ctx.closePath();
    ctx.fill();
    return;
  }

  const barW = CAPSULE_GLYPH / 3;
  ctx.rect(x, centerY - half, barW, CAPSULE_GLYPH);
  ctx.rect(x + CAPSULE_GLYPH - barW, centerY - half, barW, CAPSULE_GLYPH);
  ctx.fill();
}

function paintCapsule(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  label: string,
  style: CapsuleStyle,
  phase = 0,
) {
  const leading = capsuleLeading(style.mark?.kind);
  const chip = capsuleRect(ctx, rect, label, leading);

  ctx.beginPath();
  ctx.roundRect(chip.x, chip.y, chip.w, chip.h, CAPSULE_HEIGHT / 2);
  ctx.fillStyle = style.fill;
  ctx.fill();
  // A zero line width is ignored by the canvas (it keeps the previous one),
  // so a borderless chip skips the stroke rather than drawing a thin one.
  if (style.borderWidth > 0) {
    ctx.strokeStyle = style.border;
    ctx.lineWidth = style.borderWidth;
    ctx.stroke();
  }

  ctx.save();
  ctx.clip();

  const centerY = chip.y + chip.h / 2;
  if (style.mark) {
    paintMark(ctx, style.mark, chip.x + CAPSULE_PAD_X, centerY, phase);
  }

  ctx.fillStyle = style.text;
  ctx.fillText(
    truncateToWidth(ctx, label, chip.w - leading - CAPSULE_PAD_X * 2),
    chip.x + CAPSULE_PAD_X + leading,
    centerY,
  );
  ctx.restore();
}

/** The neutral chip shared by JSON and file cells. */
const chipStyle = (palette: SheetPalette, dpr: number): CapsuleStyle => ({
  fill: palette.accent,
  border: palette.gridline,
  borderWidth: 1 / dpr,
  text: palette.accentForeground,
});

const boolStyle = (
  value: boolean,
  palette: SheetPalette,
  dpr: number,
): CapsuleStyle => {
  const color = value ? palette.boolTrue : palette.boolFalse;
  return {
    fill: palette.background,
    border: color,
    borderWidth: 1.5 / dpr,
    text: palette.text,
    mark: { kind: "dot", color },
  };
};

/**
 * The playing chip is drawn in the accent colour rather than the neutral one,
 * so which of a column of audio notes is sounding is obvious at a glance.
 */
const audioStyle = (
  playing: boolean,
  palette: SheetPalette,
  dpr: number,
): CapsuleStyle => ({
  ...chipStyle(palette, dpr),
  border: playing ? palette.ring : palette.gridline,
  borderWidth: playing ? 1.5 / dpr : 1 / dpr,
  mark: {
    kind: playing ? "pause" : "play",
    color: playing ? palette.ring : palette.accentForeground,
  },
});

/**
 * A working run's colour by status: grey while queued, green while running,
 * and the primary orange for any custom stage the backend reports
 * (`analyzing`, ...). Terminal runs are never painted — the run hook drops
 * them — so they need no colour.
 */
export function runColor(status: string, palette: SheetPalette): string {
  if (status === "pending") return palette.mutedText;
  if (status === "running") return palette.boolTrue;
  return palette.ring;
}

/**
 * Tinted fill, pulsing dot and label all in the status colour, no outline:
 * the run chip is the one capsule drawn without a border, so it reads as a
 * soft state rather than a value.
 */
const RUN_FILL_ALPHA = 0.15;
const runStyle = (status: string, palette: SheetPalette): CapsuleStyle => {
  const color = runColor(status, palette);
  return {
    fill: withAlpha(color, RUN_FILL_ALPHA),
    border: color,
    borderWidth: 0,
    text: color,
    mark: { kind: "pulse", color },
  };
};

/** A run in progress on the cell: what to call it, and where its pulse is. */
export type RunPaint = { status: string; label: string; phase: number };

export type CellPaintArgs = {
  ctx: CanvasRenderingContext2D;
  /** The cell in content space. */
  rect: Rect;
  value: CellValue;
  type: ColumnType;
  palette: SheetPalette;
  labels: SheetLabels;
  formatters: SheetFormatters;
  dpr: number;
  /** Whether this cell is the audio note currently sounding. */
  playing?: boolean;
  /** A working run on this cell; it replaces whatever the cell holds. */
  run?: RunPaint;
};

/**
 * Draws one cell's contents. The caller has already painted the background and
 * gridlines and clipped to the body area, so this only ever adds ink.
 *
 * A working run is painted before anything else is considered — including
 * an empty cell, which is the normal state of a cell an AI is filling in.
 *
 * The capsule types each bail out early when the value matches the column.
 * When it does not, they fall through to the text path below and are painted
 * in the invalid colour, so a bad value is visible rather than hidden behind a
 * chip that would misrepresent it.
 */
export function paintCell(args: CellPaintArgs) {
  const { ctx, rect, value, type, palette, labels, formatters, dpr } = args;

  if (args.run) {
    const { status, label, phase } = args.run;
    paintCapsule(ctx, rect, label, runStyle(status, palette), phase);
    return;
  }

  if (value === null) return;

  if (type === "json" && isJsonObject(value)) {
    const label = labels.jsonCapsule(Object.keys(value).length);
    paintCapsule(ctx, rect, label, chipStyle(palette, dpr));
    return;
  }

  if (type === "file" && isResourceUrl(value)) {
    paintCapsule(ctx, rect, fileLabel(value), chipStyle(palette, dpr));
    return;
  }

  if (type === "audio" && isResourceUrl(value)) {
    const style = audioStyle(args.playing === true, palette, dpr);
    paintCapsule(ctx, rect, fileLabel(value), style);
    return;
  }

  if (type === "boolean" && typeof value === "boolean") {
    const label = value ? labels.boolTrue : labels.boolFalse;
    paintCapsule(ctx, rect, label, boolStyle(value, palette, dpr));
    return;
  }

  const text = formatCellText(value, type, labels, formatters);
  if (text === "") return;

  if (isMistyped(value, type)) ctx.fillStyle = palette.invalid;
  else if (type === "email" || type === "url") ctx.fillStyle = palette.link;
  else ctx.fillStyle = palette.text;

  const inner = COL_WIDTH - CELL_PAD_X * 2;
  const clipped = truncateToWidth(ctx, text, inner);
  const centerY = rect.y + ROW_HEIGHT / 2;

  // Numbers right-align so digits line up down the column; everything else
  // reads left-to-right from the padding edge.
  if (type === "number" && typeof value === "number") {
    ctx.textAlign = "right";
    ctx.fillText(clipped, rect.x + COL_WIDTH - CELL_PAD_X, centerY);
    ctx.textAlign = "left";
    return;
  }

  ctx.fillText(clipped, rect.x + CELL_PAD_X, centerY);
}
