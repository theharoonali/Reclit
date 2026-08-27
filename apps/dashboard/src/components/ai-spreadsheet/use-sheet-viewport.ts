"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  BLANK_TAIL_CHUNK,
  CELL_FONT_SIZE,
  GUTTER_FONT_SIZE,
  HEADER_FONT_SIZE,
  TYPE_FONT_SIZE,
} from "@/lib/ai-spreadsheet/geometry";
import { clearMetricsCache } from "@/lib/ai-spreadsheet/text-metrics";
import {
  FALLBACK_PALETTE,
  readCanvasFont,
  readPalette,
} from "@/lib/ai-spreadsheet/theme-colors";
import type {
  SheetFonts,
  SheetPalette,
  Viewport,
} from "@/lib/ai-spreadsheet/types";

const FALLBACK_FONTS: SheetFonts = {
  cell: `${CELL_FONT_SIZE}px system-ui, sans-serif`,
  header: `${HEADER_FONT_SIZE}px system-ui, sans-serif`,
  type: `${TYPE_FONT_SIZE}px system-ui, sans-serif`,
  gutter: `${GUTTER_FONT_SIZE}px system-ui, sans-serif`,
};

export type SheetViewportApi = {
  viewportRef: React.RefObject<Viewport>;
  paletteRef: React.RefObject<SheetPalette>;
  fontsRef: React.RefObject<SheetFonts>;
  /** The grid installs the real paint pass here after mount. */
  paintRef: React.RefObject<() => void>;
  requestPaint: () => void;
};

/**
 * Owns the transient view state the painters read, plus the paint scheduler.
 *
 * Everything here is a ref on purpose. The render loop must not depend on
 * React state: a state change re-renders, a re-render can remount the canvas,
 * and a remounted canvas is a blank one. Editing a cell mutates a ref and
 * schedules a frame; React never hears about it.
 */
export function useSheetViewport(
  rowCount: number,
  columnCount: number,
): SheetViewportApi {
  const viewportRef = useRef<Viewport>({
    width: 0,
    height: 0,
    scrollX: 0,
    scrollY: 0,
    rowExtent: rowCount + BLANK_TAIL_CHUNK,
    columnCount,
  });
  const paletteRef = useRef<SheetPalette>(FALLBACK_PALETTE);
  const fontsRef = useRef<SheetFonts>(FALLBACK_FONTS);
  const paintRef = useRef<() => void>(() => {});
  const frameRef = useRef(0);

  // Coalesces every caller in a frame into one paint. Not a permanently
  // running rAF loop — an idle sheet costs nothing.
  const requestPaint = useCallback(() => {
    if (frameRef.current !== 0) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      paintRef.current();
    });
  }, []);

  useEffect(() => {
    return () => {
      // Clearing the handle matters as much as cancelling it: React's dev
      // double-mount runs this cleanup between the two mounts, and a stale
      // non-zero handle would make every later `requestPaint` think a frame
      // was already pending. The canvas would then never paint at all.
      if (frameRef.current !== 0) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, []);

  useEffect(() => {
    const refreshTheme = () => {
      paletteRef.current = readPalette(document.documentElement);
      const family = document.body;
      fontsRef.current = {
        cell: readCanvasFont(family, CELL_FONT_SIZE),
        header: readCanvasFont(family, HEADER_FONT_SIZE),
        type: readCanvasFont(family, TYPE_FONT_SIZE),
        gutter: readCanvasFont(family, GUTTER_FONT_SIZE),
      };
      clearMetricsCache();
      requestPaint();
    };

    refreshTheme();

    // The theme is a class on <html>. Re-reading on it is what lets the canvas
    // recolour without a reload once `forcedTheme` comes off the provider.
    const observer = new MutationObserver(refreshTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Until webfonts land, every measurement is of the fallback face — which
    // would leave the caret sitting at the wrong x until some later repaint.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) refreshTheme();
    });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [requestPaint]);

  return { viewportRef, paletteRef, fontsRef, paintRef, requestPaint };
}
