/**
 * The app's only focus recipe.
 *
 * Every focusable control — button, input, select trigger, nav link — imports
 * this string instead of writing its own `focus-visible:*` classes. Before it
 * existed the same ring was pasted into three files and missing from `Button`
 * entirely, which left every button in the app invisible to keyboard users.
 *
 * The shape is shadcn's: the border itself moves to the ring colour and a soft
 * 3px halo sits outside it, so focus reads as the control brightening rather
 * than as a rectangle drawn around it. `aria-invalid` swaps both to
 * `--destructive`, so a field in error keeps one visual language.
 *
 * `outline-none` is part of the recipe, not a separate concern: the controls
 * own their own focus indicator, and the browser's default outline would draw
 * a second one on top of this.
 */
export const focusRing = [
  "outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
].join(" ");
