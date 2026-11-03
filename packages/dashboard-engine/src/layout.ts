import { GRID_COLUMNS, type WidgetType } from "./widget";

/**
 * The grid rules. Widgets sharing a `row` sit side by side, left → right by
 * `sort`, each spanning `column` of the 12. Spans in a row add up to at most
 * 12 — whatever is left stays empty. Both apps use this: the API refuses a
 * layout that breaks it, the dashboard lays rows out from it.
 */

export type LayoutIssue = {
  code: "DUPLICATE_SLOT" | "ROW_OVERFLOW";
  row: number;
  /** The offending widget's position in the input. */
  index: number;
  message: string;
};

export function checkLayout(
  widgets: readonly { row: number; column: number; sort: number }[],
): LayoutIssue | null {
  const slots = new Set<string>();
  const spans = new Map<number, number>();
  for (const [index, widget] of widgets.entries()) {
    const slot = `${widget.row}:${widget.sort}`;
    if (slots.has(slot)) {
      return {
        code: "DUPLICATE_SLOT",
        row: widget.row,
        index,
        message: `row ${widget.row} already has a widget at sort ${widget.sort}`,
      };
    }
    slots.add(slot);
    const used = (spans.get(widget.row) ?? 0) + widget.column;
    spans.set(widget.row, used);
    if (used > GRID_COLUMNS) {
      return {
        code: "ROW_OVERFLOW",
        row: widget.row,
        index,
        message: `row ${widget.row} spans ${used} of ${GRID_COLUMNS} columns`,
      };
    }
  }
  return null;
}

/** A card's place in the grid: its row and its order within it. */
export type WidgetSlot = { row: number; sort: number };

const nextSort = (widgets: readonly { sort: number }[]): number =>
  widgets.reduce((max, widget) => Math.max(max, widget.sort), -1) + 1;

/**
 * Where a new card of width `span` goes: the first row (ascending) whose
 * spans leave room for it, after that row's last card — so the grid fills
 * top-first — or a new bottom row when no row has room. A given `row` means
 * "after the last card of that row", whatever its width.
 */
export function placeWidget(
  widgets: readonly { row: number; column: number; sort: number }[],
  span: number,
  row?: number,
): WidgetSlot {
  if (row !== undefined) {
    return { row, sort: nextSort(widgets.filter((w) => w.row === row)) };
  }
  for (const group of toRows(widgets)) {
    const used = group.widgets.reduce((total, w) => total + w.column, 0);
    if (used + span <= GRID_COLUMNS) {
      return { row: group.row, sort: nextSort(group.widgets) };
    }
  }
  const last = widgets.reduce((max, w) => Math.max(max, w.row), -1);
  return { row: last + 1, sort: 0 };
}

/** The slots cards of these widths take when added one after another to an empty grid. */
export function placeWidgets(spans: readonly number[]): WidgetSlot[] {
  const placed: { row: number; column: number; sort: number }[] = [];
  return spans.map((span) => {
    const slot = placeWidget(placed, span);
    placed.push({ ...slot, column: span });
    return slot;
  });
}

/** A card with its packed width and slot. */
export type PackedCard<T> = T & WidgetSlot & { column: number };

/**
 * The widths `count` stat cards take so their rows divide evenly: fours of 3,
 * threes of 4, pairs of 6. An odd count fills fours first; one left over is a
 * 6 (it pairs with a 6-wide chart in placement), three left over are 4s.
 */
function statSpans(count: number): number[] {
  if (count === 0) return [];
  if (count % 4 === 0) return Array.from({ length: count }, () => 3);
  if (count % 3 === 0) return Array.from({ length: count }, () => 4);
  if (count % 2 === 0) return Array.from({ length: count }, () => 6);
  const quads = Math.floor(count / 4) * 4;
  const rest = count - quads === 1 ? [6] : [4, 4, 4];
  return [...Array.from({ length: quads }, () => 3), ...rest];
}

/**
 * Lays a generated dashboard out in full rows: stats first, then charts in
 * their input order, then tables. Stats take `statSpans`; a chart keeps 12 if
 * it asks for 12, else 6; a table is always 12. When the 6-wide cards (stats
 * and charts) are an odd number the last 6-wide chart that reads well wide (a
 * bar, line, area or heatmap — never a pie or radial, which would float in 12
 * columns) widens to 12, so no row is left half empty. `placeWidgets` then
 * assigns the slots.
 */
const WIDENS_WELL: ReadonlySet<WidgetType> = new Set([
  "bar",
  "line",
  "area",
  "heatmap",
  "radar",
]);

export function packDashboard<T extends { type: WidgetType; column: number }>(
  cards: readonly T[],
): PackedCard<T>[] {
  const stats = cards.filter((card) => card.type === "stat");
  const charts = cards.filter(
    (card) => card.type !== "stat" && card.type !== "table",
  );
  const tables = cards.filter((card) => card.type === "table");

  const statWidths = statSpans(stats.length);
  const chartWidths = charts.map((card) => (card.column === 12 ? 12 : 6));
  const halves =
    statWidths.filter((span) => span === 6).length +
    chartWidths.filter((span) => span === 6).length;
  if (halves % 2 === 1) {
    let last = chartWidths.lastIndexOf(6);
    for (let index = charts.length - 1; index >= 0; index--) {
      const chart = charts[index];
      if (chartWidths[index] === 6 && chart && WIDENS_WELL.has(chart.type)) {
        last = index;
        break;
      }
    }
    if (last !== -1) chartWidths[last] = 12;
  }

  const ordered = [...stats, ...charts, ...tables];
  const spans = [...statWidths, ...chartWidths, ...tables.map(() => 12)];
  return placeWidgets(spans).map((slot, index) => ({
    ...(ordered[index] as T),
    column: spans[index] as number,
    ...slot,
  }));
}

/** One dashboard row: its index and its widgets, left → right. */
export type DashboardRow<T> = { row: number; widgets: T[] };

/**
 * Groups widgets into rows (ascending `row`) and orders each row by `sort`.
 * Rows render independently, so a row whose spans total less than 12 keeps
 * its trailing columns empty instead of pulling up the next row.
 */
export function toRows<T extends { row: number; sort: number }>(
  widgets: readonly T[],
): DashboardRow<T>[] {
  const byRow = new Map<number, T[]>();
  for (const widget of widgets) {
    byRow.set(widget.row, [...(byRow.get(widget.row) ?? []), widget]);
  }
  return [...byRow.entries()]
    .sort(([a], [b]) => a - b)
    .map(([row, items]) => ({
      row,
      widgets: [...items].sort((a, b) => a.sort - b.sort),
    }));
}
