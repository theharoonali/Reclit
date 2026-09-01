"use client";

import { GripVertical } from "lucide-react";
import type { RefObject } from "react";

type AiSpreadsheetDragChipProps = {
  chipRef: RefObject<HTMLDivElement | null>;
  labelRef: RefObject<HTMLSpanElement | null>;
};

/**
 * The card that rides the pointer while a column is being dragged, naming the
 * column in flight.
 *
 * It is `fixed` and moved by writing `transform` straight onto the node — the
 * pointer moves dozens of times a second and React state there would re-render
 * the grid on the paint path, which is the one thing this feature must never
 * do. For the same reason the label is written through its own ref rather than
 * rendered from props.
 *
 * It starts hidden and `use-sheet-canvas.ts` reveals it by toggling the
 * `hidden` **class**, once a drag passes the movement threshold. Not the
 * `hidden` attribute: `.flex` here would out-specify the user-agent's
 * `[hidden] { display: none }` and the chip would never actually hide.
 *
 * `pointer-events-none` matters: the chip sits under the cursor, and without it
 * it would swallow the pointer events the drag itself depends on.
 */
export function AiSpreadsheetDragChip(props: AiSpreadsheetDragChipProps) {
  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-50 flex hidden select-none items-center gap-1.5 rounded-sm border border-border bg-popover px-2 py-1 text-caption text-popover-foreground shadow-lg"
      ref={props.chipRef}
    >
      <GripVertical aria-hidden className="h-3 w-3 text-muted-foreground" />
      <span ref={props.labelRef} />
    </div>
  );
}
