import { StarIcon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { NodeType } from "./types";

/**
 * The icon a column's node is shown with — in the form's node picker and,
 * painted from the same path data, left of the name in the canvas header. A
 * node with no entry (email, for now) has no icon. Hugeicons, like the sheet
 * toolbar.
 */
export const NODE_ICONS: Partial<Record<NodeType, IconSvgElement>> = {
  ai: StarIcon,
};

/** Hugeicons draw on a 24-unit square. */
export const NODE_ICON_VIEWBOX = 24;
