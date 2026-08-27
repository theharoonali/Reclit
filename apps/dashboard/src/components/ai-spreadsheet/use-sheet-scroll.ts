"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  BLANK_TAIL_CHUNK,
  COL_WIDTH,
  clamp,
  contentWidth,
  GUTTER_WIDTH,
  maxScrollX,
  maxScrollY,
  needsMoreRows,
  ROW_HEIGHT,
  scrollScale,
  spacerHeight,
} from "@/lib/ai-spreadsheet/geometry";
import type { Viewport } from "@/lib/ai-spreadsheet/types";

export type SheetScrollApi = {
  /** Re-size the spacer and re-derive the scroll ratio. */
  syncGeometry: () => void;
  scrollCellIntoView: (row: number, col: number) => void;
};

/**
 * The scroll model.
 *
 * A 5,000,000-row sheet is 160,000,000px of content, which no browser will
 * give us as a scrollable element (see `MAX_SPACER_PX`). So the spacer is a
 * fixed, safe height and the real offset is mapped through a ratio — roughly
 * 20 content pixels per scrollbar pixel at the default row count.
 *
 * That ratio is fine for dragging the thumb (still sub-row precision) but
 * would turn one wheel notch into sixty rows, so the wheel is intercepted and
 * applied to the true offset, with the native scrollTop written back behind an
 * `isSyncing` guard so the resulting `scroll` event does not fight it.
 */
export function useSheetScroll(args: {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  spacerRef: React.RefObject<HTMLDivElement | null>;
  viewportRef: React.RefObject<Viewport>;
  requestPaint: () => void;
}): SheetScrollApi {
  const { scrollerRef, spacerRef, viewportRef, requestPaint } = args;
  const scaleRef = useRef(1);
  const syncingRef = useRef(false);

  const applyNative = useCallback(() => {
    const scroller = scrollerRef.current;
    const viewport = viewportRef.current;
    if (!scroller || !viewport) return;
    syncingRef.current = true;
    scroller.scrollTop = viewport.scrollY / scaleRef.current;
    scroller.scrollLeft = viewport.scrollX;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }, [scrollerRef, viewportRef]);

  const syncGeometry = useCallback(() => {
    const spacer = spacerRef.current;
    const viewport = viewportRef.current;
    if (!spacer || !viewport) return;

    // Geometry, not styling: no utility class expresses 8,000,000px.
    spacer.style.height = `${spacerHeight(viewport.rowExtent)}px`;
    spacer.style.width = `${contentWidth(viewport.columnCount)}px`;

    scaleRef.current = scrollScale(viewport.rowExtent, viewport.height);
    viewport.scrollY = clamp(
      viewport.scrollY,
      0,
      maxScrollY(viewport.rowExtent, viewport.height),
    );
    viewport.scrollX = clamp(
      viewport.scrollX,
      0,
      maxScrollX(viewport.columnCount, viewport.width),
    );
    applyNative();
  }, [applyNative, spacerRef, viewportRef]);

  /** Hands out another chunk of blank rows as the bottom comes into reach. */
  const extendTail = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !needsMoreRows(viewport)) return false;
    viewport.rowExtent += BLANK_TAIL_CHUNK;
    // Extending changes the ratio, so scrollTop has to be rewritten in the
    // same tick or the view visibly jumps.
    syncGeometry();
    return true;
  }, [syncGeometry, viewportRef]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onWheel = (event: WheelEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      event.preventDefault();

      const unitY =
        event.deltaMode === 1
          ? ROW_HEIGHT
          : event.deltaMode === 2
            ? viewport.height
            : 1;
      const unitX = event.deltaMode === 1 ? COL_WIDTH : unitY;

      viewport.scrollY = clamp(
        viewport.scrollY + event.deltaY * unitY,
        0,
        maxScrollY(viewport.rowExtent, viewport.height),
      );
      viewport.scrollX = clamp(
        viewport.scrollX + event.deltaX * unitX,
        0,
        maxScrollX(viewport.columnCount, viewport.width),
      );

      if (!extendTail()) applyNative();
      requestPaint();
    };

    // Thumb drags, touch flings, PageUp/Down and keyboard scrolling all land
    // here rather than in the wheel handler.
    const onScroll = () => {
      const viewport = viewportRef.current;
      if (!viewport || syncingRef.current) return;
      viewport.scrollY = clamp(
        scroller.scrollTop * scaleRef.current,
        0,
        maxScrollY(viewport.rowExtent, viewport.height),
      );
      viewport.scrollX = scroller.scrollLeft;
      extendTail();
      requestPaint();
    };

    // React's onWheel is passive at the root, so preventDefault() there is a
    // no-op and the page would scroll twice.
    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [applyNative, extendTail, requestPaint, scrollerRef, viewportRef]);

  const scrollCellIntoView = useCallback(
    (row: number, col: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const top = row * ROW_HEIGHT;
      if (top < viewport.scrollY) viewport.scrollY = top;
      else if (top + ROW_HEIGHT > viewport.scrollY + viewport.height) {
        viewport.scrollY = top + ROW_HEIGHT - viewport.height;
      }

      const bodyWidth = Math.max(0, viewport.width - GUTTER_WIDTH);
      const left = col * COL_WIDTH;
      if (left < viewport.scrollX) viewport.scrollX = left;
      else if (left + COL_WIDTH > viewport.scrollX + bodyWidth) {
        viewport.scrollX = left + COL_WIDTH - bodyWidth;
      }

      if (!extendTail()) applyNative();
      requestPaint();
    },
    [applyNative, extendTail, requestPaint, viewportRef],
  );

  return { syncGeometry, scrollCellIntoView };
}
