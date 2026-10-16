"use client";

import { cn } from "@reclit/ui/cn";
import { useCallback, useEffect, useRef } from "react";
import { useCanvasSurface } from "@/hooks/use-canvas-surface";
import { useLatestRef } from "@/hooks/use-latest-ref";

export type OrbState = "idle" | "listening" | "running";

/**
 * How fast the ribbons play, per state. Idle is the design's own tempo;
 * listening and running speed the same motion up.
 */
const TEMPO: Record<OrbState, number> = {
  idle: 1,
  listening: 1.8,
  running: 2.6,
};

/** The still frame when the user prefers reduced motion. */
const STILL_TIME = 1.4;

type Ribbon = {
  color: string;
  core: string;
  freq: number;
  speed: number;
  offset: number;
  amp: number;
  drift: number;
  width: number;
};

/** Three waves across the disc. Colours are the orb's own, not theme tokens. */
const RIBBONS: Ribbon[] = [
  {
    color: "rgba(70, 190, 255, 1)",
    core: "rgba(226, 246, 255, 1)",
    freq: 1.15,
    speed: 1.45,
    offset: 0.2,
    amp: 0.2,
    drift: 0.42,
    width: 0.034,
  },
  {
    color: "rgba(255, 90, 170, 1)",
    core: "rgba(255, 214, 232, 1)",
    freq: 1.35,
    speed: -1.05,
    offset: 1.7,
    amp: 0.18,
    drift: 0.33,
    width: 0.04,
  },
  {
    color: "rgba(255, 64, 180, 1)",
    core: "rgba(255, 220, 240, 1)",
    freq: 1.05,
    speed: 0.72,
    offset: 2.6,
    amp: 0.15,
    drift: 0.28,
    width: 0.03,
  },
];

function ribbonY(ribbon: Ribbon, across: number, time: number) {
  const travel = across * Math.PI * ribbon.freq * 0.72;
  const edge = Math.cos(Math.min(1, Math.abs(across)) * Math.PI * 0.5);
  const envelope = 0.28 + 0.72 * Math.pow(Math.max(0, edge), 1.35);
  const swell = 0.84 + 0.16 * Math.sin(time * ribbon.drift + ribbon.offset);
  const phase = travel + time * ribbon.speed + ribbon.offset;
  const wave = Math.sin(phase) + 0.12 * Math.sin(phase * 2);
  return wave * ribbon.amp * 0.62 * swell * envelope;
}

function traceRibbon(
  ctx: CanvasRenderingContext2D,
  ribbon: Ribbon,
  time: number,
  cx: number,
  cy: number,
  radius: number,
  reflect: number,
) {
  const steps = 72;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const across = (i / steps) * 2 - 1;
    points.push({
      x: cx + across * (radius - 2),
      y: cy + ribbonY(ribbon, across, time) * radius * reflect,
    });
  }
  const first = points[0];
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const next = points[i + 1];
    if (!point || !next) continue;
    const midX = (point.x + next.x) * 0.5;
    const midY = (point.y + next.y) * 0.5;
    ctx.quadraticCurveTo(point.x, point.y, midX, midY);
  }
  const end = points[points.length - 1];
  if (end) ctx.lineTo(end.x, end.y);
}

/**
 * Circular wave orb: a dark disc with a rotating pink and blue wash, three smoothed
 * ribbons clipped inside it, then a shade and a light rim.
 * Coordinates are CSS pixels. Self-contained on purpose — the component
 * around it handles sizing, timing and pausing.
 */
function paint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.5;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = "#07040e";
  ctx.fillRect(0, 0, width, height);

  const spin = time * 0.45;
  const sweep = ctx.createLinearGradient(
    cx + Math.cos(spin) * radius,
    cy + Math.sin(spin) * radius,
    cx - Math.cos(spin) * radius,
    cy - Math.sin(spin) * radius,
  );
  sweep.addColorStop(0, "hsla(200, 92%, 58%, 0.72)");
  sweep.addColorStop(0.38, "hsla(330, 90%, 62%, 0.55)");
  sweep.addColorStop(0.68, "hsla(210, 92%, 52%, 0.48)");
  sweep.addColorStop(1, "hsla(322, 88%, 58%, 0.62)");
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    cx + Math.cos(spin * 1.3) * radius * 0.32,
    cy + Math.sin(spin * 0.9) * radius * 0.28,
    radius * 0.04,
    cx,
    cy,
    radius,
  );
  glow.addColorStop(0, "rgba(186, 220, 255, 0.28)");
  glow.addColorStop(0.35, "rgba(255, 160, 210, 0.12)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const ribbon of RIBBONS) {
    traceRibbon(ctx, ribbon, time, cx, cy, radius, 1);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = ribbon.color;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = radius * 0.2;
    ctx.shadowColor = ribbon.color;
    ctx.shadowBlur = radius * 0.08;
    ctx.stroke();

    traceRibbon(ctx, ribbon, time, cx, cy, radius, -0.62);
    ctx.globalAlpha = 0.07;
    ctx.lineWidth = radius * 0.12;
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = radius * 0.035;
  for (const ribbon of RIBBONS) {
    traceRibbon(ctx, ribbon, time, cx, cy, radius, 1);
    ctx.strokeStyle = ribbon.color;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = radius * ribbon.width;
    ctx.shadowColor = ribbon.color;
    ctx.stroke();

    traceRibbon(ctx, ribbon, time, cx, cy, radius, 1);
    ctx.strokeStyle = ribbon.core;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = radius * 0.008;
    ctx.shadowBlur = radius * 0.015;
    ctx.stroke();
  }

  const shade = ctx.createRadialGradient(
    cx,
    cy - radius * 0.18,
    radius * 0.2,
    cx,
    cy,
    radius,
  );
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.72, "rgba(0, 0, 0, 0.08)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.55)");
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, radius - 1.5), 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = Math.max(1, width / 480);
  ctx.stroke();
}

/**
 * The island's animated orb: a `size-orb` canvas driven by
 * `requestAnimationFrame`. `state` only changes the tempo. The loop stops
 * while the tab is hidden or the user prefers reduced motion, leaving one
 * still frame, and resumes when either changes back. Decorative — the
 * capsule's text carries the meaning.
 */
export function AssistantOrb({
  state,
  className,
}: {
  state: OrbState;
  className?: string;
}) {
  const stateRef = useLatestRef(state);
  const timeRef = useRef(0);

  const drawFrame = useCallback(() => {
    const ctx = ctxRef.current;
    const { width, height } = sizeRef.current;
    if (ctx && width > 0 && height > 0) {
      paint(ctx, width, height, timeRef.current);
    }
  }, []);
  const { canvasRef, ctxRef, sizeRef } = useCanvasSurface(drawFrame);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame: number | null = null;
    let last = 0;
    const shouldAnimate = () => !document.hidden && !reduced.matches;

    const tick = (now: number) => {
      frame = null;
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      timeRef.current += TEMPO[stateRef.current] * dt;
      drawFrame();
      if (shouldAnimate()) frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (shouldAnimate()) {
        last = 0;
        if (frame === null) frame = requestAnimationFrame(tick);
      } else {
        if (reduced.matches) timeRef.current = STILL_TIME;
        drawFrame();
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, [drawFrame]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block size-orb shrink-0 overflow-hidden rounded-full",
        className,
      )}
    >
      <canvas className="block" ref={canvasRef} />
    </span>
  );
}
