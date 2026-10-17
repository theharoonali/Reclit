import type { AssistantStatus, TerminalStatus } from "./types";

/**
 * The island's one state machine, as a pure function so the precedence can be
 * tested without a capsule in hand. The run (from the provider) outranks the
 * local field state (draft, hover, focus, voice): a run that is working or
 * waiting on an answer always shows, whatever the user was doing in the
 * field, and a finished run holds the capsule open until it is dismissed or
 * times out.
 */

export type IslandMode =
  | "idle"
  | "open"
  | "typing"
  | "recording"
  | "transcribing"
  | "submitting"
  | "running"
  | "awaiting"
  | "result";

export type VoiceState = "idle" | "recording" | "transcribing" | "error";

export type IslandInputs = {
  /** The active run's status, or `null` when no run is tracked. */
  status: AssistantStatus | null;
  draft: string;
  /** Hovered or focus-within. */
  isEngaged: boolean;
  voice: VoiceState;
  /** A finished run still being shown after the active run went away. */
  lastTerminal: TerminalStatus | null;
  /** `start` has been called and the server has not answered yet. */
  isSubmitting: boolean;
};

const TERMINAL: ReadonlySet<AssistantStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export const isTerminalStatus = (
  status: AssistantStatus,
): status is TerminalStatus => TERMINAL.has(status);

/** Queued, thinking, working or waiting on an answer — the run is alive. */
export const isActiveStatus = (status: AssistantStatus) =>
  !TERMINAL.has(status);

export function islandMode(inputs: IslandInputs): IslandMode {
  const { status, draft, isEngaged, voice, lastTerminal, isSubmitting } =
    inputs;
  if (status === "awaiting_confirmation") return "awaiting";
  if (status !== null && isActiveStatus(status)) return "running";
  if ((status !== null && isTerminalStatus(status)) || lastTerminal !== null) {
    return "result";
  }
  if (isSubmitting) return "submitting";
  if (voice === "recording") return "recording";
  if (voice === "transcribing") return "transcribing";
  if (draft.trim() !== "") return "typing";
  if (isEngaged) return "open";
  return "idle";
}

/**
 * The capsule's width per mode — token lengths from `tokens.ts`, so the
 * width can animate. At rest it is the orb and the "Reclit AI" label, or
 * those plus the page's action pill when the page offers one (`hasAction`);
 * the open field needs room to type; a run's stage line and a confirmation
 * need more.
 */
export function islandWidthClass(mode: IslandMode, hasAction = false): string {
  switch (mode) {
    case "idle":
      return hasAction ? "w-island-action" : "w-island-closed";
    case "running":
    case "awaiting":
    case "result":
      return "w-island-wide";
    default:
      return "w-island";
  }
}

/** Whether the field (and its mic / send button) is on screen. */
export const isComposing = (mode: IslandMode) =>
  mode === "open" ||
  mode === "typing" ||
  mode === "recording" ||
  mode === "transcribing" ||
  mode === "submitting";
