import { CELL_PAD_X, cellRect, GUTTER_WIDTH } from "./geometry";
import {
  CELL_PAD_Y,
  caretPosition,
  LINE_HEIGHT,
  MAX_CELL_LINES,
  rowHeightFor,
  wrapRanges,
} from "./layout";
import { measureWidth } from "./text-metrics";
import { withAlpha } from "./theme-colors";
import type { EditorState, SheetFonts, SheetPalette, Viewport } from "./types";

export type EditorPaintArgs = {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  viewport: Viewport;
  editor: EditorState;
  palette: SheetPalette;
  fonts: SheetFonts;
};

/**
 * The editing overlay. There is no DOM input here: the text, the selection and
 * the caret are all ink on the body canvas. A hidden textarea off to the side
 * owns focus and hands us `buffer`, `caret` and `selection` — see
 * `ai-spreadsheet-input-proxy.tsx`.
 *
 * The buffer wraps at the cell's width (the same `wrapRanges` the display
 * uses) and may hold newlines (Alt+Enter). The box grows with the text up to
 * MAX_CELL_LINES; past that the inside scrolls vertically (`innerScrollY`),
 * the "scroll within the cell" of tall values. It may be taller than the
 * laid-out row — it is an overlay, so it simply covers the rows below.
 */
export function paintEditor(args: EditorPaintArgs) {
  const { ctx, dpr, viewport, editor, palette, fonts } = args;
  const active = editor.active;
  if (editor.mode !== "editing" || !active) return;

  const { width, height, scrollX, scrollY, layout } = viewport;

  ctx.save();
  ctx.beginPath();
  ctx.rect(GUTTER_WIDTH, 0, Math.max(0, width - GUTTER_WIDTH), height);
  ctx.clip();
  ctx.translate(GUTTER_WIDTH - scrollX, -scrollY);

  ctx.font = fonts.cell;
  ctx.textAlign = "left";

  const cell = cellRect(layout, active.row, active.col);
  const inner = cell.w - CELL_PAD_X * 2;
  const ranges = wrapRanges(ctx, editor.buffer, inner, Number.MAX_SAFE_INTEGER);
  const boxH = Math.max(cell.h, rowHeightFor(ranges.length));
  const rect = { ...cell, h: Math.min(boxH, rowHeightFor(MAX_CELL_LINES)) };

  ctx.fillStyle = palette.background;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // Inset by half the stroke width for the same reason as the idle ring in
  // `paint-body.ts`: an un-inset stroke loses its outer half to the clip.
  const ring = 2 / dpr;
  ctx.strokeStyle = palette.ring;
  ctx.lineWidth = ring;
  ctx.strokeRect(
    rect.x + ring / 2,
    rect.y + ring / 2,
    rect.w - ring,
    rect.h - ring,
  );

  // Inside the cell the text scrolls under a clip on both axes, so a value
  // longer than the column — or taller than the cap — keeps the caret in
  // view instead of overflowing.
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x + CELL_PAD_X, rect.y, rect.w - CELL_PAD_X * 2, rect.h);
  ctx.clip();
  ctx.translate(-editor.innerScrollX, -editor.innerScrollY);

  const originX = rect.x + CELL_PAD_X;
  const lineCenter = (line: number) =>
    rect.y + CELL_PAD_Y + (line + 0.5) * LINE_HEIGHT;

  const [from, to] = editor.selection;
  if (from !== to) {
    const selFrom = Math.min(from, to);
    const selTo = Math.max(from, to);
    ctx.fillStyle = withAlpha(palette.ring, 0.25);
    ranges.forEach((range, line) => {
      const start = Math.max(range.start, selFrom);
      const end = Math.min(range.end, selTo);
      if (start >= end) return;
      const x0 = measureWidth(ctx, editor.buffer.slice(range.start, start));
      const x1 = measureWidth(ctx, editor.buffer.slice(range.start, end));
      ctx.fillRect(
        originX + x0,
        lineCenter(line) - LINE_HEIGHT / 2 + 2,
        x1 - x0,
        LINE_HEIGHT - 4,
      );
    });
  }

  ctx.fillStyle = palette.text;
  ranges.forEach((range, line) => {
    ctx.fillText(
      editor.buffer.slice(range.start, range.end),
      originX,
      lineCenter(line),
    );
  });

  if (editor.caretVisible) {
    const caret = caretPosition(ctx, editor.buffer, ranges, editor.caret);
    ctx.fillStyle = palette.text;
    ctx.fillRect(
      originX + caret.x,
      lineCenter(caret.line) - LINE_HEIGHT / 2 + 3,
      1 / dpr,
      LINE_HEIGHT - 6,
    );
  }

  ctx.restore();
  ctx.restore();
}
