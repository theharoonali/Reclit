import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale from `tailwind.config.ts`. tailwind-merge has to be told about
 * it: `text-label` is not a t-shirt size, so out of the box it is classified as
 * a *colour* and `cn("text-label", "text-primary-foreground")` silently drops
 * the size — which is how every `Button` ended up rendering at the inherited
 * 16px/400 instead of 14px/500.
 *
 * Keep this list in step with `theme.extend.fontSize`.
 */
const FONT_SIZES = [
  "display",
  "title",
  "heading",
  "subheading",
  "subtitle",
  "body",
  "label",
  "caption",
  "eyebrow",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
