import { GRID_COLUMNS, type WidgetRecord } from "@reclit/dashboard-engine";

/**
 * Axis geometry for the dashboard's recharts widgets — pure, so a chart sizes
 * its axes from its data before recharts lays it out. The numbers here are
 * recharts geometry (SVG px, degrees, tick counts) that no CSS class can
 * reach, not design tokens; each threshold is named and explained once.
 */

/** An angled tick label keeps this many characters before the ellipsis. */
export const MAX_TICK_CHARS = 12;
/** A flat (unrotated) tick shares its row with its neighbours, so fewer. */
export const MAX_FLAT_TICK_CHARS = 8;
/** A horizontal bar's category axis runs down the side and affords more. */
export const MAX_CATEGORY_CHARS = 18;
/** A legend entry sits in a row of them. */
export const MAX_LEGEND_CHARS = 16;
/** A pie with more slices than this drops its legend and slice labels — the tooltip names them. */
export const MAX_LEGEND_ITEMS = 6;

/** The average width of one `text-caption` glyph, px. */
export const TICK_CHAR_PX = 7;
/** Room for recharts' `tickMargin` and one glyph of slack for a rounded tick. */
const AXIS_PADDING_PX = 12;
/** A value axis never shrinks below the room for "100", nor grows past "$1.2M". */
export const VALUE_AXIS_MIN_PX = 32;
export const VALUE_AXIS_MAX_PX = 72;
/** The horizontal bar's category axis may take this much of the card. */
export const CATEGORY_AXIS_MAX_PX = 160;

/** The slant of an angled tick, and the axis heights that fit each layout. */
export const TICK_ANGLE = -35;
/** recharts' own XAxis default — one line of flat ticks. */
export const FLAT_TICK_HEIGHT = 30;
/** `MAX_TICK_CHARS` glyphs at `TICK_ANGLE`, plus the tick margin. */
export const ANGLED_TICK_HEIGHT = 64;

/**
 * Past this many categories a vertical bar turns horizontal and a line's axis
 * thins its ticks to the first and last; a full-width (12-column) card fits
 * twice the categories of a narrower one.
 */
export const WIDE_LABEL_LIMIT = 16;
export const LABEL_LIMIT = 8;
/** Categories whose labels average more than this read better down the side. */
const MAX_AVERAGE_LABEL_CHARS = 10;
/** Ticks slant once there are more than this many labels and the longest is longer than this. */
const ANGLE_FROM_LABELS = 6;
const ANGLE_FROM_CHARS = 6;

/** `text` cut to `max` characters, the last one an ellipsis when it was longer. */
export function truncateLabel(text: string, max = MAX_TICK_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

const compactFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** A figure for an axis tick: "1.2K", "3.4M", "-850"; smaller numbers unchanged. */
export function compactFigure(value: number): string {
  if (!Number.isFinite(value)) return "";
  return compactFormat.format(value);
}

/** The px width an axis needs for its longest tick, clamped to the axis' range. */
export function axisWidthFor(
  ticks: readonly string[],
  opts?: { max?: number },
): number {
  const longest = Math.max(0, ...ticks.map((tick) => tick.length));
  const px = longest * TICK_CHAR_PX + AXIS_PADDING_PX;
  return Math.min(
    opts?.max ?? VALUE_AXIS_MAX_PX,
    Math.max(VALUE_AXIS_MIN_PX, px),
  );
}

/**
 * The width a value axis needs for its compact ticks, from the values it will
 * span: the extremes (and zero, which every bar axis shows) bound the ticks.
 */
export function valueAxisWidth(values: readonly number[]): number {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return VALUE_AXIS_MIN_PX;
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  return axisWidthFor([compactFigure(low), compactFigure(high)]);
}

/**
 * The numbers a value axis spans: every series value, or — stacked — each
 * record's total. Blanks and text count as zero, as the chart draws them.
 */
export function seriesValues(
  rows: readonly WidgetRecord[],
  keys: readonly string[],
  opts?: { stacked?: boolean },
): number[] {
  return rows.flatMap((record) => {
    const values = keys.map((key) => Number(record[key]) || 0);
    return opts?.stacked
      ? [values.reduce((sum, value) => sum + value, 0)]
      : values;
  });
}

/** How a category axis draws its ticks along the bottom of a chart. */
export type TickLayout = {
  angle: 0 | typeof TICK_ANGLE;
  height: number;
  interval: 0 | "preserveStartEnd";
  maxChars: number;
};

export type TickPolicy =
  | { orientation: "horizontal" }
  | ({ orientation: "vertical" } & TickLayout);

/**
 * The bottom axis for `labels`: slanted and taller once there are more than
 * `ANGLE_FROM_LABELS` of them and one is longer than `ANGLE_FROM_CHARS`,
 * thinned to the first and last past `WIDE_LABEL_LIMIT`.
 */
export function tickLayout(labels: readonly string[]): TickLayout {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  const angled =
    labels.length > ANGLE_FROM_LABELS && longest > ANGLE_FROM_CHARS;
  return {
    angle: angled ? TICK_ANGLE : 0,
    height: angled ? ANGLED_TICK_HEIGHT : FLAT_TICK_HEIGHT,
    interval: labels.length > WIDE_LABEL_LIMIT ? "preserveStartEnd" : 0,
    maxChars: angled ? MAX_TICK_CHARS : MAX_FLAT_TICK_CHARS,
  };
}

/**
 * Whether a bar chart spanning `span` of the grid's columns lays its
 * categories along the bottom (`vertical`, with `tickLayout`) or down the
 * side (`horizontal`): too many labels for the width, or labels averaging
 * more than `MAX_AVERAGE_LABEL_CHARS`, go down the side.
 */
export function tickPolicy(
  labels: readonly string[],
  span: number,
): TickPolicy {
  const limit = span >= GRID_COLUMNS ? WIDE_LABEL_LIMIT : LABEL_LIMIT;
  const average =
    labels.length === 0
      ? 0
      : labels.reduce((sum, label) => sum + label.length, 0) / labels.length;
  if (labels.length > limit || average > MAX_AVERAGE_LABEL_CHARS) {
    return { orientation: "horizontal" };
  }
  return { orientation: "vertical", ...tickLayout(labels) };
}

/**
 * A tooltip heading that names the hovered record's full category, whatever
 * the (truncated, possibly numeric) tick showed — recharts' `labelFormatter`.
 */
export function tooltipCategory(categoryKey: string | undefined) {
  return (
    _label: unknown,
    payload: ReadonlyArray<{ payload?: Record<string, unknown> }>,
  ): string => {
    const record = payload[0]?.payload;
    const value = categoryKey ? record?.[categoryKey] : undefined;
    return value === null || value === undefined ? "" : String(value);
  };
}
