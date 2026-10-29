"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from "@reclit/ui/tooltip";
import type { CellTooltipContent } from "@/lib/ai-spreadsheet/cell-tooltip";

export type CellTooltipState = {
  content: CellTooltipContent;
  /** The hovered cell's box in body-canvas space (CSS pixels). */
  anchor: { x: number; y: number; width: number; height: number };
} | null;

/**
 * The full content of the hovered cell, which the canvas truncates to the
 * column width. Cells are painted pixels, so — like the header's grip
 * tooltip — the tooltip hangs off an empty box parked over the cell, and
 * `open` comes from the canvas hit-test rather than the box's own pointer
 * events: the box takes none, so a press still reaches the sheet.
 */
export function AiSpreadsheetCellTooltip(props: {
  tooltip: CellTooltipState;
  /** The pointer reached the tooltip: keep it open while it is there. */
  onPointerEnter: () => void;
  /** The pointer left the tooltip: close it. */
  onPointerLeave: () => void;
}) {
  const { tooltip } = props;
  return (
    <TooltipProvider>
      <Tooltip open={tooltip !== null}>
        <TooltipTrigger asChild>
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: tooltip?.anchor.x ?? 0,
              top: tooltip?.anchor.y ?? 0,
              width: tooltip?.anchor.width ?? 0,
              height: tooltip?.anchor.height ?? 0,
              visibility: tooltip === null ? "hidden" : "visible",
            }}
          />
        </TooltipTrigger>
        <TooltipPortal>
          {/*
           * Hoverable on purpose: a value taller than the tooltip scrolls
           * inside it. The sheet's grace period lets the pointer cross the
           * gap from the cell; entering pins it, leaving closes it.
           */}
          <TooltipContent
            align="start"
            className="max-h-cell-tooltip-tall max-w-cell-tooltip overflow-y-auto overscroll-contain whitespace-pre-wrap break-words"
            onPointerEnter={props.onPointerEnter}
            onPointerLeave={props.onPointerLeave}
            side="bottom"
            sideOffset={0}
          >
            {tooltip?.content.status && (
              <p className="text-caption text-muted-foreground">
                {tooltip.content.status}
              </p>
            )}
            {tooltip?.content.text}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
