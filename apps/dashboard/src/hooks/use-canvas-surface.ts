"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";

export type SurfaceSize = { width: number; height: number; dpr: number };

export type CanvasSurface = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  ctxRef: RefObject<CanvasRenderingContext2D | null>;
  sizeRef: RefObject<SurfaceSize>;
  /** Re-measure and re-arm the context. Safe to call at any time. */
  measure: () => void;
};

/**
 * A DPR-correct 2D canvas that tracks the size of another element.
 *
 * The backing store is sized in device pixels while the element stays sized in
 * CSS pixels, and the context is transformed by `dpr` once — so every
 * coordinate anywhere else in the feature is a CSS pixel. Text drawn without
 * that split is visibly soft on any retina display.
 *
 * `sourceRef` is what gets measured and observed, defaulting to the canvas's
 * parent. Never the canvas itself: observing an element you resize inside the
 * callback is a feedback loop. It exists because the sheet's body canvas is
 * measured against a *scroll container* it is not inside — a canvas within the
 * scroller would widen it, raise a scrollbar, shrink the client box, resize
 * the canvas, drop the scrollbar, and oscillate.
 */
export function useCanvasSurface(
  onResize: () => void,
  sourceRef?: RefObject<HTMLElement | null>,
): CanvasSurface {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef<SurfaceSize>({ width: 0, height: 0, dpr: 1 });
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const sourceRefRef = useRef(sourceRef);
  sourceRefRef.current = sourceRef;

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const source = sourceRefRef.current?.current ?? canvas?.parentElement;
    if (!canvas || !source) return;

    const dpr = window.devicePixelRatio || 1;
    // The *client* box: what is left after the source's own scrollbars.
    const width = source.clientWidth;
    const height = source.clientHeight;
    const backingW = Math.max(1, Math.round(width * dpr));
    const backingH = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== backingW || canvas.height !== backingH) {
      canvas.width = backingW;
      canvas.height = backingH;
    }
    // Geometry, not styling: Tailwind cannot express a measured pixel size.
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Re-applied every time: assigning `canvas.width` resets context state.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = "middle";

    ctxRef.current = ctx;
    sizeRef.current = { width, height, dpr };
    onResizeRef.current();
  }, []);

  useEffect(() => {
    const source =
      sourceRefRef.current?.current ?? canvasRef.current?.parentElement;
    if (!source) return;

    measure();
    // The first measure happens before the consumer has had a chance to fill
    // the source with content, so a scroll container has not raised its
    // scrollbars yet and reports a client box ~10px too wide. One follow-up
    // frame settles it without waiting on a ResizeObserver notification that
    // may be coalesced away.
    const settle = requestAnimationFrame(measure);

    const observer = new ResizeObserver(measure);
    observer.observe(source);

    // Dragging the window to a monitor with a different DPR changes nothing
    // else, so it has to be watched on its own. The query string encodes the
    // current ratio, so the listener is re-armed after every change.
    let query: MediaQueryList | null = null;
    const onDprChange = () => {
      measure();
      arm();
    };
    const arm = () => {
      query?.removeEventListener("change", onDprChange);
      const dpr = window.devicePixelRatio || 1;
      query = window.matchMedia(`(resolution: ${dpr}dppx)`);
      query.addEventListener("change", onDprChange);
    };
    arm();

    return () => {
      cancelAnimationFrame(settle);
      observer.disconnect();
      query?.removeEventListener("change", onDprChange);
    };
  }, [measure]);

  return { canvasRef, ctxRef, sizeRef, measure };
}
