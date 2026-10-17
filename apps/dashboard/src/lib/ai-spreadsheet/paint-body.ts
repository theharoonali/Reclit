import {
  COL_WIDTH,
  cellRect,
  GUTTER_WIDTH,
  ROW_HEIGHT,
  visibleCols,
  visibleRows,
} from "./geometry";
import { paintCell } from "./paint-cell";
import { selectionRects } from "./run-targets";
import { withAlpha } from "./theme-colors";
import type {
  ActiveRun,
  EditorState,
  SelectionRect,
  SheetColumn,
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

/**
 * One area of the selection: a wash plus its own ring, inset by half the
 * ring's width for the reason given where the active ring is painted.
 */
function paintArea(
  ctx: CanvasRenderingContext2D,
  rect: SelectionRect,
  palette: SheetPalette,
  dpr: number,
) {
  const x = rect.colFirst * COL_WIDTH;
  const y = rect.rowFirst * ROW_HEIGHT;
  const w = (rect.colLast - rect.colFirst + 1) * COL_WIDTH;
  const h = (rect.rowLast - rect.rowFirst + 1) * ROW_HEIGHT;
  ctx.fillStyle = withAlpha(palette.ring, 0.08);
  ctx.fillRect(x, y, w, h);
  const ring = 2 / dpr;
  ctx.strokeStyle = palette.ring;
  ctx.lineWidth = ring;
  ctx.strokeRect(x + ring / 2, y + ring / 2, w - ring, h - ring);
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
  /** The audio cell currently sounding, if any. */
  playing?: { row: number; columnId: string } | null;
  /** The working runs, keyed like `model.cells`; painted over the value. */
  runs?: ReadonlyMap<string, ActiveRun> | null;
  /** Where the run capsules are in their breath, 0..1. */
  runPhase?: number;
  /**
   * The columns in display order. Normally `model.columns`; during a drag it is
   * the preview order, so the cells slide with their headers rather than
   * staying put under them. `model` is still the source of every value —
   * cells are keyed by column id, so no value moves.
   */
  columns: SheetColumn[];
  /** The dragged column's landing slot, painted as an empty well. Null if idle. */
  draggingCol: number | null;
};

/**
 * One full repaint of the visible body. There are no dirty regions: at ~26
 * rows by ~8 columns this is a couple of hundred cells, text measurement is
 * memoised, and the bookkeeping a dirty-rect scheme needs would cost more code
 * than the frames it saves.
 */
export function paintBody(args: BodyPaintArgs) {
  const { ctx, dpr, viewport, model, editor, palette, fonts } = args;
  const { draggingCol } = args;
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
  const columns = args.columns.slice(cols.first, cols.last + 1);
  for (let row = rows.first; row <= rows.last; row++) {
    let col = cols.first;
    for (const column of columns) {
      // The dragged column rides the pointer; its slot stays empty so the gap
      // the other columns opened is what shows where it lands.
      if (col === draggingCol) {
        col++;
        continue;
      }
      const playing = args.playing;
      const key = cellKey(row, column.id);
      const run = args.runs?.get(key);
      paintCell({
        ctx,
        rect: cellRect(row, col),
        value: model.cells.get(key) ?? null,
        type: column.type,
        palette,
        labels: args.labels,
        formatters: args.formatters,
        dpr,
        playing: playing?.row === row && playing.columnId === column.id,
        run: run
          ? {
              status: run.status,
              label: args.labels.runStatus(run.status),
              phase: args.runPhase ?? 0,
            }
          : undefined,
      });
      col++;
    }
  }

  // The selection ring sits above the cells but below the editing overlay.
  // It is inset by half its width: a stroke straddles the path, so stroking
  // the cell bounds puts half the ring outside the cell, where the clip that
  // protects the gutter eats it — the first column and first row would come
  // out visibly thinner than the rest.
  const active = editor.active;
  const rects = selectionRects(editor);
  if (editor.mode === "idle") {
    // Every area gets a wash plus its own ring, painted first so the active
    // cell's ring stays readable inside it. The current area is skipped while
    // it is a single cell — the active ring already says it.
    const current = rects.length - 1;
    rects.forEach((rect, index) => {
      const single =
        rect.rowFirst === rect.rowLast && rect.colFirst === rect.colLast;
      if (index === current && single) return;
      paintArea(ctx, rect, palette, dpr);
    });
  }
  if (active && editor.mode === "idle") {
    const rect = cellRect(active.row, active.col);
    const ring = 2 / dpr;
    ctx.strokeStyle = palette.ring;
    ctx.lineWidth = ring;
    ctx.strokeRect(
      rect.x + ring / 2,
      rect.y + ring / 2,
      rect.w - ring,
      rect.h - ring,
    );
  }
  if (draggingCol !== null) {
    ctx.fillStyle = withAlpha(palette.ring, 0.06);
    ctx.fillRect(draggingCol * COL_WIDTH, scrollY, COL_WIDTH, height);
  }
  ctx.restore();

  // --- row-number gutter, painted in untranslated space so it stays pinned
  ctx.fillStyle = palette.gutter;
  ctx.fillRect(0, 0, GUTTER_WIDTH, height);

  // The selection's rows get a tinted gutter cell and a full-strength number:
  // with no checkbox, the gutter is what says "this row is selected", and the
  // tint spans the whole cell so a row selection reads from edge to edge.
  // Painted in every mode — an edit in progress is still in that row.
  ctx.font = fonts.gutter;
  ctx.textAlign = "center";
  for (let row = rows.first; row <= rows.last; row++) {
    const top = row * ROW_HEIGHT - scrollY;
    if (top < -ROW_HEIGHT || top > height) continue;
    const inSelection = rects.some(
      (rect) => row >= rect.rowFirst && row <= rect.rowLast,
    );
    if (inSelection) {
      ctx.fillStyle = withAlpha(palette.ring, 0.08);
      ctx.fillRect(0, top, GUTTER_WIDTH - lineW, ROW_HEIGHT);
    }
    ctx.fillStyle = inSelection ? palette.text : palette.mutedText;
    ctx.fillText(String(row + 1), GUTTER_WIDTH / 2, top + ROW_HEIGHT / 2);
  }
  ctx.fillStyle = palette.gridline;
  hairline(ctx, GUTTER_WIDTH - lineW, 0, lineW, height, dpr);
  ctx.textAlign = "left";
}
