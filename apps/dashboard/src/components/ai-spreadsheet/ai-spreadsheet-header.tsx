"use client";

import { cn } from "@reclit/ui/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from "@reclit/ui/tooltip";
import type { PointerEvent, RefObject } from "react";
import {
  HEADER_GRIP_HEIGHT,
  HEADER_GRIP_WIDTH,
} from "@/lib/ai-spreadsheet/geometry";

type AiSpreadsheetHeaderProps = {
  className?: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onAddColumn: () => void;
  addColumnLabel: string;
  /** Canvas-space rect of the hovered grip, or null when none is hovered. */
  gripAnchor: { x: number; y: number } | null;
  gripLabel: string;
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
 * the end of the columns has a real, screen-reader-only button behind it. The
 * column-reorder grip has no such fallback — see the route doc.
 *
 * `touch-none` is what makes the reorder drag work on a touch device: without
 * it the browser claims the gesture as a pan before `pointermove` ever fires.
 * The strip does not scroll natively anyway — the body's scroller does — so
 * there is nothing to give up.
 */
export function AiSpreadsheetHeader(props: AiSpreadsheetHeaderProps) {
  const { gripAnchor } = props;
  return (
    <div
      className={cn(
        "relative h-9 w-full shrink-0 touch-none overflow-hidden",
        props.className,
      )}
      onPointerCancel={props.onPointerCancel}
      onPointerDown={props.onPointerDown}
      onPointerLeave={props.onPointerLeave}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
    >
      <canvas className="absolute left-0 top-0 block" ref={props.canvasRef} />

      {/*
       * The grip is painted pixels, so the tooltip needs something real to
       * hang off: an empty box parked exactly over the painted glyph while it
       * is hovered. `open` is driven by the canvas hit-test rather than by the
       * anchor's own pointer events — the anchor cannot receive any, because
       * intercepting them would break the drag that starts on the same press.
       */}
      <TooltipProvider>
        <Tooltip open={gripAnchor !== null}>
          <TooltipTrigger asChild>
            <div
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: gripAnchor?.x ?? 0,
                top: gripAnchor?.y ?? 0,
                width: HEADER_GRIP_WIDTH,
                height: HEADER_GRIP_HEIGHT,
                visibility: gripAnchor === null ? "hidden" : "visible",
              }}
            />
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom">{props.gripLabel}</TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>

      <button className="sr-only" onClick={props.onAddColumn} type="button">
        {props.addColumnLabel}
      </button>
    </div>
  );
}
