"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OnboardingDescription } from "@/lib/onboarding/api";
import { toCreateColumns } from "@/lib/onboarding/column-draft";
import { type OnboardingStage, progressFor } from "@/lib/onboarding/progress";
import { useTRPC } from "@/trpc/client";
import { useOnboardingColumns } from "./use-onboarding-columns";
import { useOnboardingCreate } from "./use-onboarding-create";
import { useOnboardingDescribe } from "./use-onboarding-describe";
import { useOnboardingFinish } from "./use-onboarding-finish";
import { useOnboardingSkip } from "./use-onboarding-skip";

const DESCRIPTION_MAX = 1000;

/** The workspace the finishing step works on, once it exists. */
type Created = {
  workspaceId: string;
  spreadsheetId: string;
};

/** The screens the user moves between; `finishing` follows from the workspace existing. */
type EditableStage = Exclude<OnboardingStage, "finishing">;

const PREVIOUS: Record<EditableStage, EditableStage> = {
  name: "name",
  upload: "name",
  review: "upload",
  columns: "review",
};

/**
 * The wizard's state machine. Five screens: `name` (the workspace name, the
 * source of truth from here on), `upload` (the file, described as soon as it
 * is picked — or Skip, which creates the named empty workspace and leaves),
 * `review` (the AI's label and description, edited), `columns` (the AI's
 * proposals, edited, then the workspace is created) and `finishing` (the AI
 * columns run over the first rows and the dashboard is generated, watched
 * live). The workspace exists from the finishing step on, so a reload
 * resumes there from `workspace.list` and calls `finish` again — the flag is
 * still false until `finish` answers, which keeps the gate from redirecting.
 */
export function useOnboardingWizard() {
  const trpc = useTRPC();
  const workspaces = useQuery(trpc.workspace.list.queryOptions());

  const [stage, setStage] = useState<EditableStage>("name");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [touched, setTouched] = useState({
    description: false,
    purpose: false,
  });
  const [described, setDescribed] = useState<OnboardingDescription | null>(
    null,
  );
  const [moreContext, setMoreContext] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  const describe = useOnboardingDescribe((result) => {
    setDescribed(result);
    if (!touched.description) setDescription(result.description);
    if (!touched.purpose) setPurpose(result.purpose);
  });
  const columns = useOnboardingColumns();
  const skip = useOnboardingSkip();
  const create = useOnboardingCreate((result) =>
    setCreated({
      workspaceId: result.workspace.id,
      spreadsheetId: result.spreadsheet.id,
    }),
  );

  // A skip's workspace appears in `workspace.list` before the gate moves on:
  // it is not a resume.
  const resumed = skip.isPending ? undefined : workspaces.data?.[0];
  const active: Created | null =
    created ??
    (resumed?.spreadsheetId
      ? { workspaceId: resumed.id, spreadsheetId: resumed.spreadsheetId }
      : null);
  const finish = useOnboardingFinish(active?.workspaceId ?? "");
  const currentStage: OnboardingStage = active ? "finishing" : stage;

  // The workspace exists (just created, or found on reload): run the last
  // step once. CONFLICT means it already ran — the hook moves the gate on.
  const finishStarted = useRef(false);
  const { run: runFinish } = finish;
  useEffect(() => {
    if (!active || finishStarted.current) return;
    finishStarted.current = true;
    void runFinish();
  }, [active, runFinish]);

  const pickFile = useCallback(
    (picked: File) => {
      describe.reset();
      setFile(picked);
      setDescribed(null);
      setDescription("");
      setPurpose("");
      setTouched({ description: false, purpose: false });
      describe.run(picked);
    },
    [describe],
  );

  const suggestInput = (nextDescription: string) =>
    described && file
      ? {
          name: name.trim(),
          description: nextDescription.trim().slice(0, DESCRIPTION_MAX),
          purpose: purpose.trim(),
          columns: described.columns,
          sampleRows: described.sampleRows,
        }
      : null;

  const continueReview = () => {
    const input = suggestInput(description);
    if (!input) return;
    setStage("columns");
    columns.run(input);
  };

  const suggestAgain = () => {
    const extra = moreContext.trim();
    const next = extra
      ? `${description.trim()}\n\n${extra}`.trim()
      : description;
    const input = suggestInput(next);
    if (!input) return;
    setDescription(next.slice(0, DESCRIPTION_MAX));
    setTouched((current) => ({ ...current, description: true }));
    setMoreContext("");
    columns.run(input);
  };

  const createWorkspace = () => {
    if (!file) return;
    create.run(file, {
      name: name.trim(),
      description: description.trim().slice(0, DESCRIPTION_MAX),
      purpose: purpose.trim(),
      columns: toCreateColumns(columns.drafts),
    });
  };

  const isWorking =
    describe.isPending ||
    columns.isPending ||
    skip.isPending ||
    create.isPending ||
    finish.isRunning ||
    finish.isActive;
  const progress = progressFor({
    stage: currentStage,
    hasFile: file !== null || active !== null,
    isDescribing: describe.isPending,
    isDescribed: described !== null || active !== null,
    isSuggesting: columns.isPending,
    isCreating: create.isPending,
    isCreated: active !== null,
    isRunning: finish.isRunning,
    hasGeneration: finish.generationId !== null,
    generation: finish.generation,
  });

  return {
    stage: currentStage,
    isResuming: workspaces.isPending,
    resumeError: workspaces.isError,
    isWorking,
    progress,
    details: {
      file,
      name,
      description,
      purpose,
      setName,
      setDescription: (value: string) => {
        setDescription(value);
        setTouched((current) => ({ ...current, description: true }));
      },
      setPurpose: (value: string) => {
        setPurpose(value);
        setTouched((current) => ({ ...current, purpose: true }));
      },
      canSubmitName: name.trim() !== "",
      submitName: () => {
        if (name.trim() !== "") setStage("upload");
      },
      pickFile,
      submitUpload: () => {
        if (file) setStage("review");
      },
      skip: () => void skip.run(name.trim()),
      isSkipping: skip.isPending,
      isDescribing: describe.isPending,
      described,
      errorKey: describe.errorKey ?? skip.errorKey,
      canContinue: file !== null && described !== null && !describe.isPending,
      continue: continueReview,
      /** One screen back: upload → name, review → upload, columns → review. Not past a created workspace. */
      back: () => setStage(PREVIOUS[stage]),
      canGoBack:
        currentStage !== "finishing" &&
        !columns.isPending &&
        !create.isPending &&
        !skip.isPending,
    },
    columns: {
      ...columns,
      moreContext,
      setMoreContext,
      suggestAgain,
      create: createWorkspace,
      isCreating: create.isPending,
      createErrorKey: create.errorKey,
      fileColumnNames: described?.columns.map((column) => column.name) ?? [],
    },
    finishing: {
      spreadsheetId: active?.spreadsheetId ?? "",
      generation: finish.generation,
      isRunning: finish.isRunning,
      isActive: finish.isActive,
      hasGenerationFailed: finish.hasGenerationFailed,
      canLeave: finish.canLeave,
      errorKey: finish.errorKey,
      retry: () => void finish.run(),
      cancel: () => void finish.cancelGeneration(),
      goToDashboard: () => void finish.goToDashboard(),
    },
  };
}

export type OnboardingWizardApi = ReturnType<typeof useOnboardingWizard>;
