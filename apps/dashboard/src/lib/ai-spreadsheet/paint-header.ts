import {
  CELL_PAD_X,
  GUTTER_WIDTH,
  HEADER_GRIP_WIDTH,
  HEADER_HEIGHT,
  headerCheckboxRect,
  headerGripRect,
  isHeaderColumnHit,
  plusButtonRect,
  visibleCols,
} from "./geometry";
import type { SheetLayout } from "./layout";
import { colLeft, colWidth } from "./layout";
import { NODE_ICON_ACCENT, NODE_ICON_VIEWBOX, NODE_ICONS } from "./node-icons";
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
 * The node's icon (`NODE_ICONS`) painted left of a column's name, stroked in
 * the name's colour. Decorative and not hit-tested. Accented nodes (AI) paint
 * no icon: their whole header is washed in the accent instead.
 */
const GLYPH_SIZE = 14;
const GLYPH_GAP = 4;

/** Each icon's paths, built once — the header repaints on every hover. */
const glyphPaths = new Map<NodeType, Path2D[]>();

function nodeGlyphPaths(node: NodeType): Path2D[] | undefined {
  const icon = NODE_ICONS[node];
  if (icon === undefined) return undefined;
  let paths = glyphPaths.get(node);
  if (paths === undefined) {
    paths = icon.flatMap(([tag, attrs]) =>
      tag === "path" && typeof attrs.d === "string"
        ? [new Path2D(attrs.d)]
        : [],
    );
    glyphPaths.set(node, paths);
  }
  return paths;
}

/** Strokes a node's icon in a GLYPH_SIZE square, vertically centred. */
function paintGlyph(
  ctx: CanvasRenderingContext2D,
  paths: Path2D[],
  x: number,
  color: string,
) {
  const scale = GLYPH_SIZE / NODE_ICON_VIEWBOX;
  ctx.save();
  ctx.translate(x, (HEADER_HEIGHT - GLYPH_SIZE) / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const path of paths) ctx.stroke(path);
  ctx.restore();
}

/** The grip's dots: two columns of three, each this many CSS pixels square. */
const GRIP_DOT = 2;
const GRIP_DOT_GAP = 3;

/**
 * Six dots in the grip's rect. Filled rather than stroked, like every other
 * crisp mark in the header.
 */
function paintGrip(
  ctx: CanvasRenderingContext2D,
  layout: SheetLayout,
  col: number,
  palette: SheetPalette,
) {
  const rect = headerGripRect(layout, col);
  const pitch = GRIP_DOT + GRIP_DOT_GAP;
  const left = rect.x + (rect.w - (GRIP_DOT * 2 + GRIP_DOT_GAP)) / 2;
  const top = rect.y + (rect.h - (GRIP_DOT * 3 + GRIP_DOT_GAP * 2)) / 2;
  ctx.fillStyle = palette.mutedText;
  for (let column = 0; column < 2; column++) {
    for (let row = 0; row < 3; row++) {
      ctx.fillRect(
        left + column * pitch,
        top + row * pitch,
        GRIP_DOT,
        GRIP_DOT,
      );
    }
  }
}

export type HeaderPaintArgs = {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  viewport: Viewport;
  columns: SheetColumn[];
  palette: SheetPalette;
  labels: SheetLabels;
  fonts: SheetFonts;
  hover: SheetHit;
  /**
   * Where the dragged column currently sits in `columns` — which is already
   * the preview order, so this is the slot it would land in. Null when nothing
   * is being dragged. The column paints as an empty tinted well: it is riding
   * the pointer, so showing its name in two places at once would be a lie.
   */
  draggingCol: number | null;
  /**
   * The column a header click selected (`column-selection.ts`), in `columns`
   * order; null when the selection is anything else. It paints a stronger
   * wash than hover, so the column reads as picked while the pointer is away.
   */
  selectedCol: number | null;
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
  const { draggingCol, selectedCol } = args;
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

  const { layout } = viewport;
  for (const column of visible) {
    const x = colLeft(layout, col);
    const width = colWidth(layout, col);

    const dragging = draggingCol === col;
    const hovered = !dragging && isHeaderColumnHit(hover) && hover.col === col;

    // The dragged column's landing slot: a tinted well with nothing in it. The
    // column itself is on the pointer, and every other column has already
    // shifted around this gap, which is what shows where the drop lands.
    if (dragging) {
      ctx.fillStyle = withAlpha(palette.ring, 0.1);
      ctx.fillRect(x, 0, width, HEADER_HEIGHT);
      ctx.fillStyle = palette.gridline;
      ctx.fillRect(x, 0, lineW, HEADER_HEIGHT);
      col++;
      continue;
    }
    const accented =
      column.node !== null && NODE_ICON_ACCENT[column.node] === true;
    // AI columns wear a light accent wash in place of an icon; selection and
    // hover layer on top of it, so both still read on an AI column.
    if (accented) {
      ctx.fillStyle = withAlpha(palette.ring, 0.12);
      ctx.fillRect(x, 0, width, HEADER_HEIGHT);
    }
    if (selectedCol === col) {
      ctx.fillStyle = withAlpha(palette.ring, 0.18);
      ctx.fillRect(x, 0, width, HEADER_HEIGHT);
      ctx.fillStyle = palette.ring;
      ctx.fillRect(x, HEADER_HEIGHT - 2, width, 2);
    } else if (hovered) {
      ctx.fillStyle = withAlpha(palette.ring, 0.08);
      ctx.fillRect(x, 0, width, HEADER_HEIGHT);
    }

    // The right edge holds the type name — swapped for the drag grip while
    // the column is hovered; the column name gets what is left.
    let rightWidth: number;
    if (hovered) {
      paintGrip(ctx, layout, col, palette);
      rightWidth = HEADER_GRIP_WIDTH;
    } else {
      ctx.font = fonts.type;
      const typeName = labels.typeNames[column.type];
      rightWidth = measureWidth(ctx, typeName);
      ctx.fillStyle = palette.mutedText;
      ctx.textAlign = "right";
      ctx.fillText(typeName, x + width - CELL_PAD_X, HEADER_HEIGHT / 2);
    }

    ctx.font = fonts.header;
    ctx.fillStyle = palette.headerText;
    ctx.textAlign = "left";
    const leftInset = CELL_PAD_X;
    const glyph =
      column.node === null || accented
        ? undefined
        : nodeGlyphPaths(column.node);
    let glyphSpace = 0;
    if (glyph !== undefined) {
      paintGlyph(ctx, glyph, x + leftInset, palette.headerText);
      glyphSpace = GLYPH_SIZE + GLYPH_GAP;
    }
    const room = width - leftInset - CELL_PAD_X * 2 - rightWidth - glyphSpace;
    ctx.fillText(
      truncateToWidth(ctx, column.name, room),
      x + leftInset + glyphSpace,
      HEADER_HEIGHT / 2,
    );

    ctx.fillStyle = palette.gridline;
    ctx.fillRect(x, 0, lineW, HEADER_HEIGHT);
    col++;
  }

  const plus = plusButtonRect(viewport.layout);
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
