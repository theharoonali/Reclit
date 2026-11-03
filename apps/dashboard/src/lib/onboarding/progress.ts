import {
  type DashboardGeneration,
  type GenerationStepKey,
  generationSteps,
  type StepStatus,
} from "@/lib/dashboard/generation";

/**
 * The checklist beside the AI canvas: every step of the wizard, with what
 * is done, what is happening, what failed and what is still to come. Pure —
 * the hook hands it the flags and the live generation, the panel draws it.
 */
export type OnboardingStage =
  | "purpose"
  | "website"
  | "documents"
  | "name"
  | "upload"
  | "review"
  | "columns"
  | "finishing";

export type ProgressKey =
  | "purpose"
  | "website"
  | "documents"
  | "upload"
  | "describe"
  | "columns"
  | "create"
  | "run"
  | "analyze"
  | "propose"
  | "verify"
  | "apply";

export type ProgressStatus = StepStatus;

export type ProgressItem = { key: ProgressKey; status: ProgressStatus };

export type ProgressState = {
  stage: OnboardingStage;
  /** The company has at least one use case saved. */
  hasUseCases: boolean;
  /** The company has a website (scraped). */
  hasWebsite: boolean;
  /** `company.setWebsite` is in flight. */
  isScraping: boolean;
  /** The company has a document or rules. */
  hasDocuments: boolean;
  /** A document is uploading. */
  isUploading: boolean;
  hasFile: boolean;
  isDescribing: boolean;
  isDescribed: boolean;
  isSuggesting: boolean;
  isCreating: boolean;
  isCreated: boolean;
  /** `onboarding.finish` is in flight. */
  isRunning: boolean;
  /** `finish` answered with a `generationId`: a generation row is on its way or here. */
  hasGeneration: boolean;
  /** The live generation row, once `dashboardGeneration.latest` or the stream has it. */
  generation: DashboardGeneration | null;
};

const STAGE_ORDER: Record<OnboardingStage, number> = {
  purpose: 0,
  website: 1,
  documents: 2,
  name: 3,
  upload: 4,
  review: 5,
  columns: 6,
  finishing: 7,
};

/** The generation's steps the wizard shows after its own `run` entry. */
const GENERATION_KEYS: readonly Exclude<GenerationStepKey, "run">[] = [
  "analyze",
  "propose",
  "verify",
  "apply",
];

/**
 * "AI filling the first rows": active while `finish` is pending or the
 * generation still waits for its batch; done once the generation has moved
 * past that (or never had a batch to wait for); active while the row has been
 * announced but not yet seen.
 */
function runStatus(state: ProgressState): ProgressStatus {
  if (state.isRunning) return "active";
  if (state.generation) {
    const run = generationSteps(state.generation).find(
      (step) => step.key === "run",
    );
    return run?.status ?? "done";
  }
  return state.hasGeneration ? "active" : "pending";
}

export function progressFor(state: ProgressState): ProgressItem[] {
  const at = STAGE_ORDER[state.stage];
  const status = (done: boolean, active: boolean): ProgressStatus =>
    done ? "done" : active ? "active" : "pending";
  const generation = generationSteps(state.generation);
  const generationStatus = (key: GenerationStepKey): ProgressStatus =>
    generation.find((step) => step.key === key)?.status ?? "pending";
  // The company steps are done only when there is something to show for
  // them: a skipped website or documents step stays pending.
  return [
    {
      key: "purpose",
      status: status(state.hasUseCases, state.stage === "purpose"),
    },
    {
      key: "website",
      status: status(
        state.hasWebsite && !state.isScraping,
        state.isScraping || state.stage === "website",
      ),
    },
    {
      key: "documents",
      status: status(
        state.hasDocuments && !state.isUploading,
        state.isUploading || state.stage === "documents",
      ),
    },
    { key: "upload", status: status(state.hasFile, state.stage === "upload") },
    {
      key: "describe",
      status: status(state.isDescribed, state.isDescribing),
    },
    {
      key: "columns",
      status: status(
        at >= STAGE_ORDER.columns && !state.isSuggesting,
        state.isSuggesting,
      ),
    },
    { key: "create", status: status(state.isCreated, state.isCreating) },
    { key: "run", status: runStatus(state) },
    ...GENERATION_KEYS.map((key) => ({ key, status: generationStatus(key) })),
  ];
}
