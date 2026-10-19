/**
 * The checklist beside the AI canvas: every step of the wizard, with what
 * is done, what is happening and what is still to come. Pure — the hook
 * hands it the flags, the panel draws it.
 */
export type OnboardingStage = "upload" | "review" | "columns" | "widgets";

export type ProgressKey =
  | "upload"
  | "describe"
  | "columns"
  | "create"
  | "cards"
  | "run";

export type ProgressStatus = "pending" | "active" | "done";

export type ProgressItem = { key: ProgressKey; status: ProgressStatus };

export type ProgressState = {
  stage: OnboardingStage;
  hasFile: boolean;
  isDescribing: boolean;
  isDescribed: boolean;
  isSuggesting: boolean;
  isCreating: boolean;
  isCreated: boolean;
  isRecommending: boolean;
  isRunning: boolean;
};

const STAGE_ORDER: Record<OnboardingStage, number> = {
  upload: 0,
  review: 1,
  columns: 2,
  widgets: 3,
};

export function progressFor(state: ProgressState): ProgressItem[] {
  const at = STAGE_ORDER[state.stage];
  const status = (done: boolean, active: boolean): ProgressStatus =>
    done ? "done" : active ? "active" : "pending";
  return [
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
    {
      key: "cards",
      status: status(
        at >= STAGE_ORDER.widgets && !state.isRecommending,
        state.isRecommending,
      ),
    },
    { key: "run", status: status(false, state.isRunning) },
  ];
}
