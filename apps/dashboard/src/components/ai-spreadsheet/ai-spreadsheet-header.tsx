"use client";

import { cn } from "@reclit/ui/cn";
import type { MouseEvent, RefObject } from "react";

type AiSpreadsheetHeaderProps = {
  className?: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onPointerDown: (event: MouseEvent<HTMLDivElement>) => void;
  onPointerMove: (event: MouseEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
  onAddColumn: () => void;
  addColumnLabel: string;
};

/**
 * The header is a canvas of its own in its own grid row, which is the whole
 * trick to pinning it: it never scrolls vertically because it is not inside
 * the scroll container at all. Horizontal sync comes from painting with the
 * body's `scrollX`.
 *
 * `h-9` must stay in step with `HEADER_HEIGHT` — the canvas is sized from this
 * element's box.
 *
 * The canvas is taken out of flow and the strip clips. Its width is a pixel
 * value written imperatively and only corrected when the `ResizeObserver`
 * fires, so an in-flow canvas would be briefly wider than its container after
 * the sidebar collapses — widening the whole page, and carrying the docked
 * side panel out past the right edge with it.
 *
 * The canvas is invisible to assistive tech, so the "+" affordance painted at
 * the end of the columns has a real, screen-reader-only button behind it.
 */
export function AiSpreadsheetHeader(props: AiSpreadsheetHeaderProps) {
  return (
    <div
      className={cn(
        "relative h-9 w-full shrink-0 overflow-hidden",
        props.className,
      )}
      onPointerDown={props.onPointerDown}
      onPointerLeave={props.onPointerLeave}
      onPointerMove={props.onPointerMove}
    >
      <canvas className="absolute left-0 top-0 block" ref={props.canvasRef} />
      <button className="sr-only" onClick={props.onAddColumn} type="button">
        {props.addColumnLabel}
      </button>
    </div>
  );
}
