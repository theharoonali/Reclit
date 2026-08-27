import { formatCellText, isJsonObject, isMistyped } from "./cell-format";
import {
  CAPSULE_HEIGHT,
  CAPSULE_PAD_X,
  CELL_PAD_X,
  COL_WIDTH,
  type Rect,
  ROW_HEIGHT,
} from "./geometry";
import { measureWidth, truncateToWidth } from "./text-metrics";
import type {
  CellValue,
  ColumnType,
  SheetFormatters,
  SheetLabels,
  SheetPalette,
} from "./types";

/**
 * The bounds of a JSON capsule inside its cell. Exported because the pointer
 * hit-test uses *this* function rather than re-deriving the geometry — the
 * chip you can click is by construction the chip that was drawn.
 *
 * `rect` is the cell in content space.
 */
export function capsuleRect(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  label: string,
): Rect {
  const natural = measureWidth(ctx, label) + CAPSULE_PAD_X * 2;
  return {
    x: rect.x + CELL_PAD_X,
    y: rect.y + (ROW_HEIGHT - CAPSULE_HEIGHT) / 2,
    w: Math.min(natural, COL_WIDTH - CELL_PAD_X * 2),
    h: CAPSULE_HEIGHT,
  };
}

function paintCapsule(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  label: string,
  palette: SheetPalette,
  dpr: number,
) {
  const chip = capsuleRect(ctx, rect, label);

  ctx.beginPath();
  ctx.roundRect(chip.x, chip.y, chip.w, chip.h, CAPSULE_HEIGHT / 2);
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.strokeStyle = palette.gridline;
  ctx.lineWidth = 1 / dpr;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = palette.accentForeground;
  ctx.fillText(
    truncateToWidth(ctx, label, chip.w - CAPSULE_PAD_X * 2),
    chip.x + CAPSULE_PAD_X,
    chip.y + chip.h / 2,
  );
  ctx.restore();
}

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
};

/**
 * Draws one cell's contents. The caller has already painted the background and
 * gridlines and clipped to the body area, so this only ever adds ink.
 */
export function paintCell(args: CellPaintArgs) {
  const { ctx, rect, value, type, palette, labels, formatters, dpr } = args;
  if (value === null) return;

  if (type === "json") {
    if (!isJsonObject(value)) return;
    paintCapsule(
      ctx,
      rect,
      labels.jsonCapsule(Object.keys(value).length),
      palette,
      dpr,
    );
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

  // Numbers right-align so digits line up down the column; booleans centre on
  // their glyph; everything else reads left-to-right from the padding edge.
  if (type === "number" && typeof value === "number") {
    ctx.textAlign = "right";
    ctx.fillText(clipped, rect.x + COL_WIDTH - CELL_PAD_X, centerY);
    ctx.textAlign = "left";
    return;
  }

  if (type === "boolean") {
    ctx.textAlign = "center";
    ctx.fillText(clipped, rect.x + COL_WIDTH / 2, centerY);
    ctx.textAlign = "left";
    return;
  }

  ctx.fillText(clipped, rect.x + CELL_PAD_X, centerY);
}
