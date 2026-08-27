import {
  CELL_PAD_X,
  COL_WIDTH,
  cellRect,
  GUTTER_WIDTH,
  ROW_HEIGHT,
} from "./geometry";
import { caretXForIndex } from "./text-metrics";
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
 */
export function paintEditor(args: EditorPaintArgs) {
  const { ctx, dpr, viewport, editor, palette, fonts } = args;
  const active = editor.active;
  if (editor.mode !== "editing" || !active) return;

  const { width, height, scrollX, scrollY } = viewport;

  ctx.save();
  ctx.beginPath();
  ctx.rect(GUTTER_WIDTH, 0, Math.max(0, width - GUTTER_WIDTH), height);
  ctx.clip();
  ctx.translate(GUTTER_WIDTH - scrollX, -scrollY);

  const rect = cellRect(active.row, active.col);
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

  // Inside the cell the text scrolls horizontally under a clip, so a value
  // longer than the column keeps the caret in view instead of overflowing.
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x + CELL_PAD_X, rect.y, COL_WIDTH - CELL_PAD_X * 2, ROW_HEIGHT);
  ctx.clip();
  ctx.translate(-editor.innerScrollX, 0);

  ctx.font = fonts.cell;
  ctx.textAlign = "left";
  const originX = rect.x + CELL_PAD_X;
  const centerY = rect.y + ROW_HEIGHT / 2;

  const [from, to] = editor.selection;
  if (from !== to) {
    const start = caretXForIndex(ctx, editor.buffer, Math.min(from, to));
    const end = caretXForIndex(ctx, editor.buffer, Math.max(from, to));
    ctx.fillStyle = withAlpha(palette.ring, 0.25);
    ctx.fillRect(originX + start, rect.y + 4, end - start, ROW_HEIGHT - 8);
  }

  ctx.fillStyle = palette.text;
  ctx.fillText(editor.buffer, originX, centerY);

  if (editor.caretVisible) {
    const caretX = caretXForIndex(ctx, editor.buffer, editor.caret);
    ctx.fillStyle = palette.text;
    ctx.fillRect(originX + caretX, rect.y + 6, 1 / dpr, ROW_HEIGHT - 12);
  }

  ctx.restore();
  ctx.restore();
}
