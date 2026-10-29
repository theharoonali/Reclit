import { AiSparklesIcon, Mail01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { NodeType } from "./types";

/**
 * The icon a column's node is shown with — in the form's node picker and,
 * painted from the same path data, left of the name in the canvas header. A
 * node with no entry (google_search, for now) has no icon. Hugeicons, like
 * the sheet toolbar. Canvas painting strokes only `path` elements, so every
 * icon here must be path-only (AiSparklesIcon and Mail01Icon both are).
 */
export const NODE_ICONS: Partial<Record<NodeType, IconSvgElement>> = {
  ai: AiSparklesIcon,
  email: Mail01Icon,
};

/**
 * Nodes drawn in the primary accent rather than the neutral header text —
 * the AI mark reads as a brand accent in both renderers (`text-primary` in
 * the DOM, `palette.ring` on canvas).
 */
export const NODE_ICON_ACCENT: Partial<Record<NodeType, true>> = {
  ai: true,
};

/** Hugeicons draw on a 24-unit square. */
export const NODE_ICON_VIEWBOX = 24;
