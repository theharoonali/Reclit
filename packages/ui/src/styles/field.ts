import { focusField } from "./focus-ring";

/**
 * The text-control family. `Input`, `Textarea` and `SelectTrigger` are one
 * control with different innards, so their box, border, type and disabled
 * treatment are written once here.
 */
const fieldBase = [
  "flex w-full rounded-sm border border-input bg-transparent px-field-x text-body transition-colors",
  "disabled:cursor-not-allowed disabled:opacity-50",
  focusField,
].join(" ");

/** A single-line field: fixed control height. */
export const fieldSingleLine = `${fieldBase} h-control py-field-y`;

/** A multi-line field: minimum height, room for wrapped lines. */
export const fieldMultiLine = `${fieldBase} min-h-field-multi py-field-y-multi`;
