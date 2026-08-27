"use client";

import { cn } from "@reclit/ui/cn";
import type { MouseEvent, ReactNode, RefObject } from "react";

type AiSpreadsheetBodyProps = {
  className?: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  spacerRef: RefObject<HTMLDivElement | null>;
  onPointerDown: (event: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: MouseEvent<HTMLDivElement>) => void;
  rowCount: number;
  columnCount: number;
  label: string;
  /** The hidden input proxy. Sits over the active cell. */
  children?: ReactNode;
};

/**
 * The scrolling half of the sheet, in three stacked layers.
 *
 * The canvas sits *behind* the scroll container rather than inside it, and
 * that is load-bearing: a canvas inside would count towards the container's
 * scrollable overflow, so sizing it to the client box would raise a scrollbar,
 * which shrinks the client box, which resizes the canvas, which drops the
 * scrollbar — an oscillation that settles with both scrollbars stuck on.
 * Outside, the canvas is sized *from* the client box and never feeds back.
 *
 * The scroller on top is transparent and empty apart from the spacer, so it
 * exists purely to own the scrolling and the pointer events. Its scrollbars
 * are hidden: at 8,000,000px of scroll range the thumb is a sliver that tells
 * the reader nothing, and hiding it also means the client box never changes
 * width. The spacer is absolutely positioned: it still contributes scrollable
 * overflow, which is the whole point of it, but takes no space in flow.
 */
export function AiSpreadsheetBody(props: AiSpreadsheetBodyProps) {
  return (
    <div className={cn("relative min-h-0", props.className)}>
      <canvas
        className="pointer-events-none absolute left-0 top-0 block"
        ref={props.canvasRef}
      />
      <div
        aria-colcount={props.columnCount}
        aria-label={props.label}
        aria-rowcount={props.rowCount}
        className="scrollbar-none absolute inset-0 overflow-auto"
        onDoubleClick={props.onDoubleClick}
        onPointerDown={props.onPointerDown}
        ref={props.scrollerRef}
        role="grid"
      >
        {/* Sized imperatively: no utility class expresses 8,000,000px. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0"
          ref={props.spacerRef}
        />
      </div>
      {props.children}
    </div>
  );
}
