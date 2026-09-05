import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { fontSize, sizes } from "../tokens";

/**
 * `cn` merges class lists and lets a later class override an earlier one of
 * the same kind. tailwind-merge only knows Tailwind's default scale, so it is
 * taught the token names here: without this, `text-label` would be read as a
 * *colour* and dropped next to `text-primary-foreground`, and `h-control`
 * would survive alongside an `h-auto` override. Both lists derive from
 * `tokens.ts`, so adding a token needs no edit here.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: Object.keys(fontSize),
      spacing: Object.keys(sizes),
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
