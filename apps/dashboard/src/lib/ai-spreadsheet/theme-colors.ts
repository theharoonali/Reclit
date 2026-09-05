import { type ColorToken, colors } from "@reclit/ui/tokens";
import type { SheetPalette } from "./types";

/**
 * Canvas cannot use Tailwind classes, so the sheet's colours are read out of
 * the same CSS custom properties the rest of the app styles from. Every colour
 * on the canvas therefore still traces back to a token in
 * `packages/ui/src/tokens.ts` — editing a token restyles the grid.
 */

/** Which token each palette slot reads — the single mapping for both readers. */
const PALETTE_TOKENS: Record<keyof SheetPalette, ColorToken> = {
  background: "background",
  // `--card` is the "slightly different but still on-theme" surface the
  // header and the row-number gutter share.
  header: "card",
  headerText: "card-foreground",
  gutter: "card",
  gridline: "border",
  text: "foreground",
  mutedText: "muted-foreground",
  accent: "accent",
  accentForeground: "accent-foreground",
  ring: "primary",
  link: "primary",
  invalid: "destructive",
  boolTrue: "success",
  boolFalse: "warning",
};

function buildPalette(read: (token: ColorToken) => string): SheetPalette {
  return Object.fromEntries(
    Object.entries(PALETTE_TOKENS).map(([slot, token]) => [slot, read(token)]),
  ) as SheetPalette;
}

/**
 * Tokens are bare HSL triples (`20 90% 55%`), so this only has to wrap them in
 * `hsl()`. It still splits on commas as well as spaces: a token written in the
 * legacy comma form would otherwise produce `hsl(20, 90%, 55%)`, which parses
 * but breaks `withAlpha`.
 */
function toHsl(raw: string): string {
  const [h, s, l] = raw
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!h || !s || !l) return "hsl(0 0% 0%)";
  return `hsl(${h} ${s} ${l})`;
}

/** Only ever called with the output of `toHsl`. */
export const withAlpha = (color: string, alpha: number) =>
  color.replace(")", ` / ${alpha})`);

/**
 * Reads the canvas's own computed font so canvas text matches DOM text — the
 * element inherits `--font-sans` from `body` like everything else.
 */
export function readCanvasFont(el: HTMLElement, size: number): string {
  const family = getComputedStyle(el).fontFamily || "system-ui, sans-serif";
  return `${size}px ${family}`;
}

export function readPalette(el: HTMLElement): SheetPalette {
  const styles = getComputedStyle(el);
  return buildPalette((token) => toHsl(styles.getPropertyValue(`--${token}`)));
}

/**
 * Used for the very first render, before `getComputedStyle` is reachable.
 * Derived from the light tokens, so it cannot drift from what the DOM paints.
 */
export const FALLBACK_PALETTE: SheetPalette = buildPalette(
  (token) => `hsl(${colors.light[token]})`,
);
