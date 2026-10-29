"use client";

import { cn } from "@reclit/ui/cn";
import { useCallback, useEffect, useRef } from "react";
import { useCanvasSurface } from "@/hooks/use-canvas-surface";
import { useLatestRef } from "@/hooks/use-latest-ref";

export type OrbState = "idle" | "listening" | "running";

/**
 * How fast the field plays, per state. Idle is the canvas's own tempo;
 * listening and running speed the same motion up.
 */
const TEMPO: Record<OrbState, number> = {
  idle: 1,
  listening: 1.8,
  running: 2.6,
};

/** Seconds into the motion when the user prefers reduced motion. */
const STILL_TIME = 1.15;

/** The solving canvas's playback rate, applied on top of `TEMPO`. */
const SPEED = 1.82 * 0.8;

const MOVE_COUNT = 14;

/** The 28px icon the field was tuned for. Larger canvases keep its spacing. */
const ICON_PX = 28;

type Axis = 0 | 1 | 2;

type Move = {
  axis: Axis;
  lo: number;
  hi: number;
  ang: number;
};

type Field = {
  latRings: number;
  lonDensity: number;
  rBase: number;
  rDepth: number;
  rActive: number;
  inkFar: number;
  inkSpan: number;
  rsPow: number;
  rMin: number;
};

type Dot = {
  x: number;
  y: number;
  z: number;
  r: number;
  white: number;
};

type Twist = {
  amount: number[];
  active: number;
};

function hash(x: number, y: number) {
  const n = 43758.5453 * Math.sin(12.9898 * x + 78.233 * y);
  return n - Math.floor(n);
}

function axisOf(i: number): Axis {
  const axis = Math.min(2, Math.floor(3 * hash(i, 2.3)));
  if (axis === 0 || axis === 1) return axis;
  return 2;
}

function buildMoves(count: number): Move[] {
  const list: Move[] = [];
  for (let i = 0; i < count; i++) {
    const lo = -1 + 0.5 * Math.min(3, Math.floor(4 * hash(i, 5.9)));
    const dir = hash(i, 7.7) > 0.5 ? -1 : 1;
    list.push({
      axis: axisOf(i),
      lo,
      hi: lo + 0.5,
      ang: (dir * Math.PI) / 2,
    });
  }
  return list;
}

const MOVES = buildMoves(MOVE_COUNT);

/**
 * Ring counts from the solving canvas (`count` 0.35), scaled so a canvas
 * larger than the 28px icon keeps the same dust instead of a sparse shell.
 */
function fieldFor(size: number): Field {
  const density = Math.sqrt(0.35) * (size / ICON_PX);
  const sizeMul = 1.05;
  return {
    latRings: Math.max(2, Math.round(15 * density)),
    lonDensity: Math.max(2, Math.round(40 * density)),
    rBase: 0.6 * sizeMul,
    rDepth: 1.7 * sizeMul,
    rActive: 0.3 * sizeMul,
    inkFar: 0.62,
    inkSpan: 0.54,
    rsPow: 0.6,
    rMin: 0.3,
  };
}

function project(yaw: number, pitch: number, size: number) {
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const ox = size / 2;
  const oy = size / 2;
  const scale = (size / 2) * 0.82;
  return (x: number, y: number, z: number) => {
    const u = -x * sy + z * cy;
    return [
      ox + (x * cy + z * sy) * scale,
      oy - (y * cp - u * sp) * scale,
      y * sp + u * cp,
    ] as const;
  };
}

function twist(time: number, count: number): Twist {
  const span = 2 * count * 0.42 + 1.2;
  const t = time % span;
  const amount = Array.from({ length: count }, () => 0);
  let active = -1;
  if (t < 2 * count * 0.42) {
    const step = Math.floor(t / 0.42);
    const p = Math.min(1, (t - 0.42 * step) / 0.42 / 0.7);
    const eased = 1 - (1 - p) ** 3;
    if (step < count) {
      for (let j = 0; j < step; j++) amount[j] = 1;
      amount[step] = eased;
      active = step;
    } else {
      const back = 2 * count - 1 - step;
      for (let k = 0; k < back; k++) amount[k] = 1;
      amount[back] = 1 - eased;
      active = back;
    }
  }
  return { amount, active };
}

function turn(
  point: readonly [number, number, number],
  cubes: readonly Move[],
  state: Twist,
): [number, number, number, boolean] {
  let x = point[0];
  let y = point[1];
  let z = point[2];
  let hot = false;
  for (let i = 0; i < cubes.length; i++) {
    const amount = state.amount[i] ?? 0;
    if (amount <= 0) continue;
    const move = cubes[i];
    if (!move) continue;
    const coord = move.axis === 0 ? x : move.axis === 1 ? y : z;
    if (coord < move.lo || coord >= move.hi) continue;
    if (i === state.active) hot = true;
    const ang = move.ang * amount;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    if (move.axis === 0) {
      const nx = y * c - z * s;
      z = y * s + z * c;
      y = nx;
    } else if (move.axis === 1) {
      const nx = x * c + z * s;
      z = -x * s + z * c;
      x = nx;
    } else {
      const nx = x * c - y * s;
      y = x * s + y * c;
      x = nx;
    }
  }
  return [x, y, z, hot];
}

function rubik(size: number, time: number, field: Field): Dot[] {
  const cam = project(0.55 * time, 0.35 + 0.1 * Math.sin(0.9 * time), size);
  const scale = (size / 300) ** field.rsPow;
  const state = twist(time, MOVE_COUNT);
  const dots: Dot[] = [];
  for (let lat = 0; lat <= field.latRings; lat++) {
    const phi = -Math.PI / 2 + (lat / field.latRings) * Math.PI;
    const cy = Math.cos(phi);
    const sy = Math.sin(phi);
    const segs = Math.max(1, Math.round(Math.abs(cy) * field.lonDensity));
    for (let lon = 0; lon < segs; lon++) {
      const th = (lon / segs) * 2 * Math.PI;
      const spun = turn(
        [cy * Math.cos(th), sy, cy * Math.sin(th)],
        MOVES,
        state,
      );
      const p = cam(spun[0], spun[1], spun[2]);
      const depth = (p[2] + 1) / 2;
      dots.push({
        x: p[0],
        y: p[1],
        z: p[2],
        r:
          (field.rBase + field.rDepth * depth + (spun[3] ? field.rActive : 0)) *
          scale,
        white: field.inkFar - field.inkSpan * depth - (spun[3] ? 0.14 : 0),
      });
    }
  }
  for (const dot of dots) dot.r = Math.max(field.rMin, dot.r);
  dots.sort((a, b) => a.z - b.z);
  return dots;
}

/**
 * The solving field: a twisting particle sphere on a transparent ground.
 * Coordinates are CSS pixels. The component around it handles sizing,
 * timing and pausing. Ink is the canvas's own grayscale, not a theme token.
 */
function paint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
) {
  const size = Math.min(width, height);
  ctx.clearRect(0, 0, width, height);
  if (size <= 0) return;
  const ox = (width - size) / 2;
  const oy = (height - size) / 2;
  const dots = rubik(size, time, fieldFor(size));
  for (const dot of dots) {
    const g = Math.round(Math.min(1, Math.max(0, dot.white)) * 255);
    ctx.fillStyle = `rgba(${g},${g},${g},1)`;
    ctx.beginPath();
    ctx.arc(dot.x + ox, dot.y + oy, dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The island's animated mark: a `size-orb` canvas driven by
 * `requestAnimationFrame`. `state` only changes the tempo. The loop stops
 * while the tab is hidden or the user prefers reduced motion, leaving one
 * still frame, and resumes when either changes back. Decorative — the
 * capsule's text carries the meaning. Onboarding uses the same mark, larger.
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
      paint(ctx, width, height, timeRef.current * SPEED);
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
      className={cn("relative block size-orb shrink-0", className)}
    >
      <canvas className="block" ref={canvasRef} />
    </span>
  );
}
