/**
 * `measureText` is the single most-called thing in a paint pass — once per
 * visible cell, plus once per caret keystroke — and it is not cheap. Results
 * are memoised per (font, text).
 *
 * The cache MUST be cleared when the font changes, which includes the moment
 * webfonts finish loading: the first paint measures the fallback face, and
 * without a clear every caret x-position stays wrong until something else
 * happens to repaint.
 */
let cache = new Map<string, number>();

const ELLIPSIS = "…";

export function clearMetricsCache() {
  cache = new Map();
}

export function measureWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
): number {
  if (text === "") return 0;
  const key = `${ctx.font} ${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const width = ctx.measureText(text).width;
  cache.set(key, width);
  return width;
}

/** Caret x relative to the start of the text, in CSS pixels. */
export const caretXForIndex = (
  ctx: CanvasRenderingContext2D,
  text: string,
  index: number,
) => measureWidth(ctx, text.slice(0, index));

/**
 * Binary-searches the longest prefix that fits, then appends an ellipsis.
 * Linear scanning here would make wide columns of long text visibly janky.
 */
export function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return "";
  if (measureWidth(ctx, text) <= maxWidth) return text;

  const room = maxWidth - measureWidth(ctx, ELLIPSIS);
  if (room <= 0) return ELLIPSIS;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measureWidth(ctx, text.slice(0, mid)) <= room) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low)}${ELLIPSIS}`;
}
