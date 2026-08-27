import {
  COL_WIDTH,
  cellRect,
  GUTTER_PAD_X,
  GUTTER_WIDTH,
  ROW_HEIGHT,
  visibleCols,
  visibleRows,
} from "./geometry";
import { paintCell } from "./paint-cell";
import type {
  EditorState,
  SheetFonts,
  SheetFormatters,
  SheetLabels,
  SheetModel,
  SheetPalette,
  Viewport,
} from "./types";
import { cellKey } from "./types";

/**
 * A one-device-pixel line. `lineWidth = 1` + `stroke()` on integer coordinates
 * straddles two device pixels and renders as a soft grey smear at DPR 1 and a
 * double line at DPR 2; a filled rect snapped to the device grid does not.
 */
function hairline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dpr: number,
) {
  ctx.fillRect(Math.round(x * dpr) / dpr, Math.round(y * dpr) / dpr, w, h);
}

export type BodyPaintArgs = {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  viewport: Viewport;
  model: SheetModel;
  editor: EditorState;
  palette: SheetPalette;
  labels: SheetLabels;
  formatters: SheetFormatters;
  fonts: SheetFonts;
};

/**
 * One full repaint of the visible body. There are no dirty regions: at ~26
 * rows by ~8 columns this is a couple of hundred cells, text measurement is
 * memoised, and the bookkeeping a dirty-rect scheme needs would cost more code
 * than the frames it saves.
 */
export function paintBody(args: BodyPaintArgs) {
  const { ctx, dpr, viewport, model, editor, palette, fonts } = args;
  const { width, height, scrollX, scrollY } = viewport;

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);

  const rows = visibleRows(viewport);
  const cols = visibleCols(viewport);

  // --- cells, clipped to the right of the gutter so nothing bleeds under it
  ctx.save();
  ctx.beginPath();
  ctx.rect(GUTTER_WIDTH, 0, Math.max(0, width - GUTTER_WIDTH), height);
  ctx.clip();
  ctx.translate(GUTTER_WIDTH - scrollX, -scrollY);

  ctx.fillStyle = palette.gridline;
  const lineW = 1 / dpr;
  const spanW = (cols.last - cols.first + 1) * COL_WIDTH;
  for (let row = rows.first; row <= rows.last + 1; row++) {
    hairline(ctx, cols.first * COL_WIDTH, row * ROW_HEIGHT, spanW, lineW, dpr);
  }
  const spanH = (rows.last - rows.first + 1) * ROW_HEIGHT;
  for (let col = cols.first; col <= cols.last + 1; col++) {
    hairline(ctx, col * COL_WIDTH, rows.first * ROW_HEIGHT, lineW, spanH, dpr);
  }

  ctx.font = fonts.cell;
  ctx.textAlign = "left";
  const columns = model.columns.slice(cols.first, cols.last + 1);
  for (let row = rows.first; row <= rows.last; row++) {
    let col = cols.first;
    for (const column of columns) {
      paintCell({
        ctx,
        rect: cellRect(row, col),
        value: model.cells.get(cellKey(row, column.id)) ?? null,
        type: column.type,
        palette,
        labels: args.labels,
        formatters: args.formatters,
        dpr,
      });
      col++;
    }
  }

  // The selection ring sits above the cells but below the editing overlay.
  const active = editor.active;
  if (active && editor.mode === "idle") {
    const rect = cellRect(active.row, active.col);
    ctx.strokeStyle = palette.ring;
    ctx.lineWidth = 2 / dpr;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();

  // --- row-number gutter, painted in untranslated space so it stays pinned
  ctx.fillStyle = palette.gutter;
  ctx.fillRect(0, 0, GUTTER_WIDTH, height);
  ctx.fillStyle = palette.gridline;
  hairline(ctx, GUTTER_WIDTH - lineW, 0, lineW, height, dpr);

  ctx.font = fonts.gutter;
  ctx.textAlign = "right";
  for (let row = rows.first; row <= rows.last; row++) {
    const y = row * ROW_HEIGHT - scrollY + ROW_HEIGHT / 2;
    if (y < -ROW_HEIGHT || y > height + ROW_HEIGHT) continue;
    ctx.fillStyle =
      active && active.row === row ? palette.text : palette.mutedText;
    ctx.fillText(String(row + 1), GUTTER_WIDTH - GUTTER_PAD_X, y);
  }
  ctx.textAlign = "left";
}
