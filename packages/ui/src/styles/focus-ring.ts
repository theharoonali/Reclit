/**
 * The app's focus recipes. Every focusable control composes one of these
 * instead of writing its own `focus-visible:*` classes, so keyboard focus
 * looks the same everywhere and changes in one place.
 *
 * `outline-none` is part of each recipe: the control draws its own indicator,
 * and the browser's default outline would sit on top of it.
 */

/**
 * Buttons, links and anything without a resting border: the border moves to
 * `--ring` and a soft 3px halo sits outside it, so focus reads as the control
 * brightening. `aria-invalid` swaps both to `--destructive`.
 */
export const focusRing = [
  "outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
].join(" ");

/**
 * Bordered text controls (`Input`, `Textarea`, `SelectTrigger`): the border
 * colour alone moves to `--ring`. No halo.
 */
export const focusField = [
  "outline-none",
  "focus-visible:border-ring",
  "aria-invalid:border-destructive",
].join(" ");

/**
 * A 1px outline in place of the halo, for a control that sits against a
 * border — the sidebar's account trigger — where the halo would read as a
 * floating card. Composed *after* `focusRing` so it replaces the ring.
 */
export const focusOutline =
  "focus-visible:outline focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-0";
