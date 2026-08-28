import type { SheetPalette } from "./types";

/**
 * Canvas cannot use Tailwind classes, so the sheet's colours are read out of
 * the same CSS custom properties the rest of the app styles from. Every colour
 * on the canvas therefore still traces back to a token in
 * `packages/ui/src/globals.css` — editing a token restyles the grid.
 *
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
  const read = (token: string) => toHsl(styles.getPropertyValue(`--${token}`));

  return {
    background: read("background"),
    // `--card` is the "slightly different but still on-theme" surface the
    // header and the row-number gutter share.
    header: read("card"),
    headerText: read("card-foreground"),
    gutter: read("card"),
    gridline: read("border"),
    text: read("foreground"),
    mutedText: read("muted-foreground"),
    accent: read("accent"),
    accentForeground: read("accent-foreground"),
    ring: read("primary"),
    link: read("primary"),
    invalid: read("destructive"),
    boolTrue: read("success"),
    boolFalse: read("warning"),
  };
}

/** Used for the very first render, before `getComputedStyle` is reachable. */
export const FALLBACK_PALETTE: SheetPalette = {
  background: "hsl(0 0% 100%)",
  header: "hsl(45 18% 96%)",
  headerText: "hsl(216 8.5% 11.6%)",
  gutter: "hsl(45 18% 96%)",
  gridline: "hsl(45 5% 85%)",
  text: "hsl(216 8.5% 11.6%)",
  mutedText: "hsl(0 0% 38%)",
  accent: "hsl(40 10% 94%)",
  accentForeground: "hsl(216 8.5% 11.6%)",
  ring: "hsl(20 90% 55%)",
  link: "hsl(20 90% 55%)",
  invalid: "hsl(0 84.2% 60.2%)",
  boolTrue: "hsl(142 70% 38%)",
  boolFalse: "hsl(45 90% 42%)",
};
