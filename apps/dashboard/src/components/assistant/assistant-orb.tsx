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
const STILL_TIME = 1.15;

type Rgb = readonly [number, number, number];

type Wave = {
  shift: number;
  color: Rgb;
  core: Rgb;
};

/** Two waves across the disc. Colours are the orb's own, not theme tokens. */
const WAVES: Wave[] = [
  { shift: 0, color: [64, 168, 255], core: [236, 247, 255] },
  { shift: 1, color: [255, 52, 36], core: [255, 186, 150] },
];

const STEPS = 140;

function motion(time: number) {
  const morph = 0.5 + 0.5 * Math.sin(time * 0.27);
  return {
    freq: 0.92 + morph * 0.78,
    amp: 0.24 + morph * 0.14,
    split: 0.35 + 2.35 * (0.5 + 0.5 * Math.sin(time * 0.19)),
  };
}

function waveY(across: number, time: number, shift: number) {
  const m = motion(time);
  const breathe = 0.84 + 0.16 * Math.sin(time * 0.58 + shift * 1.7);
  const phase = time * 0.82 + shift * m.split;
  const p = across * Math.PI * m.freq + phase;
  const shape = Math.sin(p) + 0.14 * Math.sin(p * 2 + 0.5);
  const env = Math.max(0, 1 - across * across) ** 0.72;
  return shape * m.amp * breathe * env;
}

function ribbonPath(
  ctx: CanvasRenderingContext2D,
  time: number,
  shift: number,
  cx: number,
  cy: number,
  radius: number,
  bulk: number,
) {
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  for (let i = 0; i <= STEPS; i++) {
    const across = (i / STEPS) * 2 - 1;
    const env = Math.max(0, 1 - across * across) ** 0.8;
    const y = waveY(across, time, shift) * radius;
    const half = radius * bulk * (0.05 + 0.95 * env);
    const x = cx + across * radius * 0.985;
    upper.push([x, cy + y - half]);
    lower.push([x, cy + y + half]);
  }
  const start = upper[0];
  if (!start) return;
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (let i = 1; i < upper.length; i++) {
    const point = upper[i];
    if (point) ctx.lineTo(point[0], point[1]);
  }
  for (let i = lower.length - 1; i >= 0; i--) {
    const point = lower[i];
    if (point) ctx.lineTo(point[0], point[1]);
  }
  ctx.closePath();
}

function centerPath(
  ctx: CanvasRenderingContext2D,
  time: number,
  shift: number,
  cx: number,
  cy: number,
  radius: number,
) {
  ctx.beginPath();
  for (let i = 0; i <= STEPS; i++) {
    const across = (i / STEPS) * 2 - 1;
    const x = cx + across * radius * 0.985;
    const y = cy + waveY(across, time, shift) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
}

function rgba(rgb: Rgb, alpha: number) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function paintWave(
  ctx: CanvasRenderingContext2D,
  time: number,
  wave: Wave,
  cx: number,
  cy: number,
  radius: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = `rgb(${wave.color[0]}, ${wave.color[1]}, ${wave.color[2]})`;
  ctx.fillStyle = rgba(wave.color, 0.16);
  ctx.shadowBlur = radius * 0.22;
  ribbonPath(ctx, time, wave.shift, cx, cy, radius, 0.018);
  ctx.fill();

  ctx.shadowBlur = radius * 0.045;
  ctx.fillStyle = rgba(wave.color, 0.78);
  ribbonPath(ctx, time, wave.shift, cx, cy, radius, 0.011);
  ctx.fill();

  const core = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
  core.addColorStop(0, rgba(wave.core, 0));
  core.addColorStop(0.16, rgba(wave.core, 0.2));
  core.addColorStop(0.5, "rgba(255, 255, 255, 0.8)");
  core.addColorStop(0.84, rgba(wave.core, 0.2));
  core.addColorStop(1, rgba(wave.core, 0));
  ctx.shadowBlur = radius * 0.012;
  ctx.strokeStyle = core;
  ctx.lineWidth = Math.max(1, radius * 0.007);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  centerPath(ctx, time, wave.shift, cx, cy, radius);
  ctx.stroke();
  ctx.restore();
}

type Gloss = { x: number; y: number; color: string; alpha: number };

function glossSpots(time: number): Gloss[] {
  return [
    {
      x: Math.cos(time * 0.9) * 0.46,
      y: Math.sin(time * 0.7) * 0.4,
      color: "80, 180, 255",
      alpha: 0.5,
    },
    {
      x: Math.cos(time * 0.75 + 2.1) * 0.5,
      y: Math.sin(time * 1.05 + 1) * 0.42,
      color: "255, 70, 160",
      alpha: 0.4,
    },
    {
      x: Math.cos(time * 0.62 + 4) * 0.42,
      y: Math.sin(time * 0.84 + 2.4) * 0.48,
      color: "255, 100, 40",
      alpha: 0.36,
    },
  ];
}

/**
 * Circular wave orb: a dark disc with a rotating blue–purple–pink–orange
 * sweep, three drifting gloss spots and a white sheen, two filled ribbons
 * clipped inside it, then a shade and a gradient rim. Coordinates are CSS
 * pixels. Self-contained on purpose — the component around it handles
 * sizing, timing and pausing.
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

  ctx.fillStyle = "#07030c";
  ctx.fillRect(0, 0, width, height);

  const spin = time * 0.65;
  const sweep = ctx.createLinearGradient(
    cx + Math.cos(spin) * radius,
    cy + Math.sin(spin) * radius,
    cx - Math.cos(spin) * radius,
    cy - Math.sin(spin * 0.85) * radius,
  );
  sweep.addColorStop(0, "rgba(70, 165, 255, 0.62)");
  sweep.addColorStop(0.34, "rgba(186, 64, 255, 0.4)");
  sweep.addColorStop(0.66, "rgba(255, 64, 130, 0.36)");
  sweep.addColorStop(1, "rgba(255, 96, 42, 0.48)");
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, width, height);

  for (const spot of glossSpots(time)) {
    const wash = ctx.createRadialGradient(
      cx + spot.x * radius,
      cy + spot.y * radius,
      radius * 0.02,
      cx,
      cy,
      radius * 0.78,
    );
    wash.addColorStop(0, `rgba(${spot.color}, ${spot.alpha})`);
    wash.addColorStop(0.45, `rgba(${spot.color}, ${spot.alpha * 0.22})`);
    wash.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
  }

  for (const wave of WAVES) paintWave(ctx, time, wave, cx, cy, radius);

  const sheen = ctx.createRadialGradient(
    cx + Math.sin(time * 0.8) * radius * 0.32,
    cy - radius * 0.4 + Math.cos(time * 0.55) * radius * 0.1,
    radius * 0.02,
    cx,
    cy - radius * 0.05,
    radius * 0.75,
  );
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  sheen.addColorStop(0.35, "rgba(255, 255, 255, 0.08)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);

  const shade = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(0.82, "rgba(0, 0, 0, 0.08)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.42)");
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const rimWidth = Math.max(2, radius * 0.018);
  const rim = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
  rim.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  rim.addColorStop(0.22, "rgba(255, 255, 255, 0.45)");
  rim.addColorStop(0.5, "rgba(190, 150, 170, 0.22)");
  rim.addColorStop(1, "rgba(255, 122, 78, 0.42)");
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, radius - rimWidth * 0.5), 0, Math.PI * 2);
  ctx.strokeStyle = rim;
  ctx.lineWidth = rimWidth;
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
