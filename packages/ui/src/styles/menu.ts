/**
 * Shared by `Select` and `DropdownMenu`: a floating list is one surface
 * whichever primitive opens it.
 */

/** The floating surface itself. */
export const menuSurface =
  "z-50 min-w-menu overflow-hidden rounded-sm border border-border bg-popover text-popover-foreground";

/** A non-interactive group label inside the list. */
export const menuLabel = "px-2 py-1.5 text-caption text-muted-foreground";

/** A rule between groups. */
export const menuSeparator = "-mx-1 my-1 h-px bg-border";
