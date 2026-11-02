import type { RouterOutputs } from "@reclit/api/trpc/routers/_app";

/**
 * The dashboard generation's types, derived from the router so they cannot
 * drift, and the pure reductions behind the progress card: the worker's nine
 * phases → the five steps a person watches, the tRPC code → the message key,
 * the current log entry → its detail line. Shared by `/` and the onboarding
 * finishing screen.
 */

export type DashboardGeneration = RouterOutputs["dashboardGeneration"]["byId"];
export type GenerationPhase = DashboardGeneration["phase"];

export type GenerationStepKey =
  | "run"
  | "analyze"
  | "propose"
  | "verify"
  | "apply";

/** The steps in the order shown; `run` only when the generation waits for an onboarding batch. */
export const GENERATION_STEP_KEYS: readonly GenerationStepKey[] = [
  "run",
  "analyze",
  "propose",
  "verify",
  "apply",
];

export type StepStatus = "pending" | "active" | "done" | "failed";

/** `completed`, `failed` or `cancelled` — the generation will not change again. */
export function isTerminalGeneration(
  generation: Pick<DashboardGeneration, "status">,
): boolean {
  return (
    generation.status === "completed" ||
    generation.status === "failed" ||
    generation.status === "cancelled"
  );
}

/** Which step the worker's phase belongs to; `queued` precedes them all. */
const STEP_OF_PHASE: Record<GenerationPhase, GenerationStepKey | null> = {
  queued: null,
  waiting_for_rows: "run",
  analyzing: "analyze",
  proposing: "propose",
  laying_out: "propose",
  verifying: "verify",
  retrying: "propose",
  applying: "apply",
  done: "apply",
};

/**
 * The checklist: steps before the current phase's are done, the current is
 * active — or failed, when the generation failed or was cancelled — and the
 * rest pending. A completed generation is all done; a queued one has its first
 * step active. Without a batch to wait for there is no `run` step.
 */
export function generationSteps(
  generation: DashboardGeneration | null,
): { key: GenerationStepKey; status: StepStatus }[] {
  if (!generation) {
    return GENERATION_STEP_KEYS.map((key) => ({ key, status: "pending" }));
  }
  const keys = GENERATION_STEP_KEYS.filter(
    (key) => key !== "run" || generation.awaitBatchId !== null,
  );
  if (generation.status === "completed") {
    return keys.map((key) => ({ key, status: "done" }));
  }
  const currentKey = STEP_OF_PHASE[generation.phase];
  const current = Math.max(0, currentKey ? keys.indexOf(currentKey) : 0);
  const stopped = isTerminalGeneration(generation);
  return keys.map((key, index) => ({
    key,
    status:
      index < current
        ? "done"
        : index === current
          ? stopped
            ? "failed"
            : "active"
          : "pending",
  }));
}

/** The tRPC code → the `dashboard.generation.errors.*` key; the contract maps busy to CONFLICT, no key to SERVICE_UNAVAILABLE and a dispatch failure to BAD_GATEWAY. */
export function generationErrorKey(
  code: string | undefined,
): "busy" | "unavailable" | "dispatch" | "error" {
  switch (code) {
    case "CONFLICT":
      return "busy";
    case "SERVICE_UNAVAILABLE":
      return "unavailable";
    case "BAD_GATEWAY":
      return "dispatch";
    default:
      return "error";
  }
}

/** The newest log entry's detail line — what the worker is doing right now — or null. */
export function generationDetail(
  generation: DashboardGeneration | null,
): string | null {
  const last = generation?.log.at(-1);
  return last?.detail ?? null;
}
