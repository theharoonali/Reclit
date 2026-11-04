"use client";

import { cn } from "@reclit/ui/cn";
import { useCallback, useEffect, useRef } from "react";
import { useCanvasSurface } from "@/hooks/use-canvas-surface";
import { useLatestRef } from "@/hooks/use-latest-ref";

export type OrbState = "idle" | "listening" | "running";

/**
 * How fast the cube plays, per state. Idle is the canvas's own tempo;
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

/** The 28px icon the cube was tuned for. Larger canvases scale that frame. */
const ICON_PX = 28;

/** One gray per face, axis then side. Every sticker on that face shares it. */
const FACE_SHADE = [0.2, 0.84, 0.36, 0.9, 0.5, 0.66] as const;

const CELLS = 3;
const CUBE = 0.72;
const CELL = (2 * CUBE) / CELLS;
const HALF_STICKER = (CELL * 0.92) / 2;

const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

type Axis = 0 | 1 | 2;
type Layer = -1 | 0 | 1;

type Move = {
  axis: Axis;
  layer: Layer;
  ang: number;
};

type Twist = {
  amount: number[];
  active: number;
};

type Point = [number, number, number];

type Sticker = {
  corners: Point[];
  z: number;
  white: number;
};

function layerOf(coord: number): Layer {
  if (coord < -0.24) return -1;
  if (coord > 0.24) return 1;
  return 0;
}

function axisAt(axis: Axis, step: number): Axis {
  const next = (axis + step) % 3;
  if (next === 1) return 1;
  if (next === 2) return 2;
  return 0;
}

function setAxis(point: Point, axis: Axis, value: number) {
  if (axis === 0) point[0] = value;
  else if (axis === 1) point[1] = value;
  else point[2] = value;
}

function addAxis(point: Point, axis: Axis, value: number) {
  if (axis === 0) point[0] += value;
  else if (axis === 1) point[1] += value;
  else point[2] += value;
}

const MOVES: Move[] = [];
for (const axis of [0, 1, 2] as const) {
  for (const layer of [-1, 0, 1] as const) {
    MOVES.push({
      axis,
      layer,
      ang: (layer === 0 ? -1 : 1) * (Math.PI / 2),
    });
  }
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

function spin(
  axis: Axis,
  c: number,
  s: number,
  px: number,
  py: number,
  pz: number,
): Point {
  if (axis === 0) return [px, py * c - pz * s, py * s + pz * c];
  if (axis === 1) return [px * c + pz * s, py, -px * s + pz * c];
  return [px * c - py * s, px * s + py * c, pz];
}

function turn(point: Point, state: Twist): Point {
  let x = point[0];
  let y = point[1];
  let z = point[2];
  for (let i = 0; i < MOVES.length; i++) {
    const amount = state.amount[i] ?? 0;
    if (amount <= 0) continue;
    const move = MOVES[i];
    if (!move) continue;
    const coord = move.axis === 0 ? x : move.axis === 1 ? y : z;
    if (layerOf(coord) !== move.layer) continue;
    const ang = move.ang * amount;
    const next = spin(move.axis, Math.cos(ang), Math.sin(ang), x, y, z);
    x = next[0];
    y = next[1];
    z = next[2];
  }
  return [x, y, z];
}

function turnWith(point: Point, anchor: Point, state: Twist): Point {
  let x = point[0];
  let y = point[1];
  let z = point[2];
  let ax = anchor[0];
  let ay = anchor[1];
  let az = anchor[2];
  for (let i = 0; i < MOVES.length; i++) {
    const amount = state.amount[i] ?? 0;
    if (amount <= 0) continue;
    const move = MOVES[i];
    if (!move) continue;
    const coord = move.axis === 0 ? ax : move.axis === 1 ? ay : az;
    if (layerOf(coord) !== move.layer) continue;
    const ang = move.ang * amount;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const next = spin(move.axis, c, s, x, y, z);
    x = next[0];
    y = next[1];
    z = next[2];
    const nextAnchor = spin(move.axis, c, s, ax, ay, az);
    ax = nextAnchor[0];
    ay = nextAnchor[1];
    az = nextAnchor[2];
  }
  return [x, y, z];
}

function rubik(size: number, time: number): Sticker[] {
  const yaw = 0.7 + 0.55 * time;
  const pitch = 0.5 + 0.08 * Math.sin(0.9 * time);
  const cam = project(yaw, pitch, size);
  const toward: Point = [
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ];
  const state = twist(time, MOVES.length);
  const stickers: Sticker[] = [];
  for (const axis of [0, 1, 2] as const) {
    for (const face of [0, 1] as const) {
      for (let i = 0; i < CELLS; i++) {
        for (let j = 0; j < CELLS; j++) {
          const center: Point = [0, 0, 0];
          setAxis(center, axis, face === 0 ? -CUBE : CUBE);
          setAxis(center, axisAt(axis, 1), -CUBE + CELL * (i + 0.5));
          setAxis(center, axisAt(axis, 2), -CUBE + CELL * (j + 0.5));
          const corners: Point[] = [];
          for (const [su, sv] of CORNERS) {
            const corner: Point = [center[0], center[1], center[2]];
            addAxis(corner, axisAt(axis, 1), su * HALF_STICKER);
            addAxis(corner, axisAt(axis, 2), sv * HALF_STICKER);
            const spun = turnWith(corner, center, state);
            const projected = cam(spun[0], spun[1], spun[2]);
            corners.push([projected[0], projected[1], projected[2]]);
          }
          const mid = turn(center, state);
          const outward: Point = [0, 0, 0];
          outward[axis] = face === 0 ? -1 : 1;
          const turned = turnWith(
            [
              center[0] + outward[0],
              center[1] + outward[1],
              center[2] + outward[2],
            ],
            center,
            state,
          );
          const facing =
            (turned[0] - mid[0]) * toward[0] +
            (turned[1] - mid[1]) * toward[1] +
            (turned[2] - mid[2]) * toward[2];
          if (facing <= 0) continue;
          const p = cam(mid[0], mid[1], mid[2]);
          stickers.push({
            corners,
            z: p[2],
            white: FACE_SHADE[axis * 2 + face] ?? 0.5,
          });
        }
      }
    }
  }
  stickers.sort((a, b) => a.z - b.z);
  return stickers;
}

/**
 * The solving cube: grayscale stickers on a transparent ground, one shade
 * per face, layers twisting. Coordinates are CSS pixels. The component
 * around it handles sizing, timing and pausing. Ink is the canvas's own
 * grayscale, not a theme token.
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
  const zoom = size / ICON_PX;
  const stickers = rubik(ICON_PX, time);
  const ox = (width - size) / 2;
  const oy = (height - size) / 2;
  for (const sticker of stickers) {
    const g = Math.round(Math.min(1, Math.max(0, sticker.white)) * 255);
    ctx.fillStyle = `rgba(${g},${g},${g},1)`;
    ctx.beginPath();
    for (let index = 0; index < sticker.corners.length; index++) {
      const corner = sticker.corners[index];
      if (!corner) continue;
      const x = ox + corner[0] * zoom;
      const y = oy + corner[1] * zoom;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * The island's animated mark: a `size-orb` canvas driven by
 * `requestAnimationFrame`. `state` only changes the tempo. One frame is
 * queued at a time and the clock is read, not added to, so a second
 * callback cannot speed the cube up. The loop stops while the tab is hidden
 * or the user prefers reduced motion, leaving one still frame, and resumes
 * when either changes back. Decorative — the capsule's text carries the
 * meaning. Onboarding uses the same mark, larger.
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
    let origin = 0;
    let carried = timeRef.current;
    let tempo = TEMPO[stateRef.current];
    let alive = true;
    const shouldAnimate = () => alive && !document.hidden && !reduced.matches;

    const tick = (now: number) => {
      if (!alive) return;
      const nextTempo = TEMPO[stateRef.current];
      if (origin === 0 || nextTempo !== tempo) {
        carried = timeRef.current;
        origin = now;
        tempo = nextTempo;
      }
      timeRef.current = carried + ((now - origin) / 1000) * tempo;
      drawFrame();
      frame = null;
      if (shouldAnimate()) schedule();
    };
    const schedule = () => {
      if (!shouldAnimate() || frame !== null) return;
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (!alive) return;
      if (shouldAnimate()) {
        origin = 0;
        carried = timeRef.current;
        tempo = TEMPO[stateRef.current];
        schedule();
      } else {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        if (reduced.matches) timeRef.current = STILL_TIME;
        drawFrame();
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    return () => {
      alive = false;
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
