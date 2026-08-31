import {
  CELL_PAD_X,
  COL_WIDTH,
  GUTTER_WIDTH,
  HEADER_DELETE_HIT_PAD,
  HEADER_HEIGHT,
  headerCheckboxRect,
  headerDeleteRect,
  inflateRect,
  plusButtonRect,
  visibleCols,
} from "./geometry";
import { type CheckboxPaintState, paintCheckbox } from "./paint-checkbox";
import { measureWidth, truncateToWidth } from "./text-metrics";
import { withAlpha } from "./theme-colors";
import type {
  NodeType,
  SheetColumn,
  SheetFonts,
  SheetHit,
  SheetLabels,
  SheetPalette,
  Viewport,
} from "./types";

/**
 * The badge painted left of a column's name, keyed by its node. A node with
 * no entry (email, for now) paints nothing. Emoji ignore `fillStyle`, so no
 * colour plumbing is needed; the glyph is decorative and not hit-tested.
 */
const NODE_GLYPHS: Partial<Record<NodeType, string>> = { ai: "✨" };
const GLYPH_GAP = 4;

export type HeaderPaintArgs = {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  viewport: Viewport;
  columns: SheetColumn[];
  palette: SheetPalette;
  labels: SheetLabels;
  fonts: SheetFonts;
  hover: SheetHit;
  /** Select-all state: none, some stored rows selected, or all of them. */
  selectAll: CheckboxPaintState;
  /**
   * The header canvas spans the side panel too, so it is wider than the body.
   * The strip is filled to this width; columns are clipped to `viewport.width`
   * so the segment above an open panel stays plain background.
   */
  stripWidth: number;
};

/**
 * The header is its own canvas in its own grid row, which is what pins it: it
 * simply never scrolls vertically. It shares the body's horizontal scroll by
 * translating with the same `scrollX`, and clips to the body's width so the
 * strip above the side panel stays plain background.
 */
export function paintHeader(args: HeaderPaintArgs) {
  const { ctx, dpr, viewport, columns, palette, labels, fonts, hover } = args;
  const { width, scrollX } = viewport;
  const strip = Math.max(width, args.stripWidth);
  const lineW = 1 / dpr;

  ctx.fillStyle = palette.header;
  ctx.fillRect(0, 0, strip, HEADER_HEIGHT);

  ctx.save();
  ctx.beginPath();
  ctx.rect(GUTTER_WIDTH, 0, Math.max(0, width - GUTTER_WIDTH), HEADER_HEIGHT);
  ctx.clip();
  ctx.translate(GUTTER_WIDTH - scrollX, 0);

  const cols = visibleCols(viewport);
  const visible = columns.slice(cols.first, cols.last + 1);
  let col = cols.first;

  for (const column of visible) {
    const x = col * COL_WIDTH;

    const hovered =
      (hover.kind === "header" || hover.kind === "header-delete") &&
      hover.col === col;
    if (hovered) {
      ctx.fillStyle = withAlpha(palette.ring, 0.08);
      ctx.fillRect(x, 0, COL_WIDTH, HEADER_HEIGHT);
    }

    // The right edge holds the type name — swapped for the delete affordance
    // while the column is hovered; the column name gets what is left.
    let rightWidth: number;
    if (hovered) {
      const box = headerDeleteRect(col);
      if (hover.kind === "header-delete") {
        const zone = inflateRect(box, HEADER_DELETE_HIT_PAD);
        ctx.fillStyle = withAlpha(palette.invalid, 0.12);
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      }
      ctx.strokeStyle = palette.invalid;
      ctx.lineWidth = Math.max(1, Math.round(1.5 * dpr)) / dpr;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 4);
      ctx.lineTo(cx + 4, cy + 4);
      ctx.moveTo(cx + 4, cy - 4);
      ctx.lineTo(cx - 4, cy + 4);
      ctx.stroke();
      rightWidth = box.w;
    } else {
      ctx.font = fonts.type;
      const typeName = labels.typeNames[column.type];
      rightWidth = measureWidth(ctx, typeName);
      ctx.fillStyle = palette.mutedText;
      ctx.textAlign = "right";
      ctx.fillText(typeName, x + COL_WIDTH - CELL_PAD_X, HEADER_HEIGHT / 2);
    }

    ctx.font = fonts.header;
    ctx.fillStyle = palette.headerText;
    ctx.textAlign = "left";
    const glyph = column.node === null ? undefined : NODE_GLYPHS[column.node];
    let glyphSpace = 0;
    if (glyph !== undefined) {
      ctx.fillText(glyph, x + CELL_PAD_X, HEADER_HEIGHT / 2);
      glyphSpace = measureWidth(ctx, glyph) + GLYPH_GAP;
    }
    const room = COL_WIDTH - CELL_PAD_X * 3 - rightWidth - glyphSpace;
    ctx.fillText(
      truncateToWidth(ctx, column.name, room),
      x + CELL_PAD_X + glyphSpace,
      HEADER_HEIGHT / 2,
    );

    ctx.fillStyle = palette.gridline;
    ctx.fillRect(x, 0, lineW, HEADER_HEIGHT);
    col++;
  }

  const plus = plusButtonRect(columns.length);
  if (hover.kind === "plus") {
    ctx.fillStyle = withAlpha(palette.ring, 0.12);
    ctx.fillRect(plus.x, 0, plus.w, HEADER_HEIGHT);
  }
  ctx.fillStyle = palette.gridline;
  ctx.fillRect(plus.x, 0, lineW, HEADER_HEIGHT);
  ctx.strokeStyle = palette.mutedText;
  ctx.lineWidth = Math.max(1, Math.round(1.5 * dpr)) / dpr;
  const cx = plus.x + plus.w / 2;
  const cy = HEADER_HEIGHT / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 5, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.stroke();

  ctx.restore();

  // The corner block covers the gutter's slice of the header, and the two
  // borders below are drawn last so no column separator overlaps them.
  ctx.fillStyle = palette.header;
  ctx.fillRect(0, 0, GUTTER_WIDTH, HEADER_HEIGHT);
  paintCheckbox(ctx, headerCheckboxRect(), args.selectAll, palette, dpr);
  ctx.fillStyle = palette.gridline;
  ctx.fillRect(GUTTER_WIDTH - lineW, 0, lineW, HEADER_HEIGHT);
  ctx.fillRect(0, HEADER_HEIGHT - lineW, strip, lineW);
}
