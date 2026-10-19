"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { OnboardingDescription } from "@/lib/onboarding/api";
import { workspaceNameFromFile } from "@/lib/onboarding/api";
import { toCreateColumns } from "@/lib/onboarding/column-draft";
import { type OnboardingStage, progressFor } from "@/lib/onboarding/progress";
import { useTRPC } from "@/trpc/client";
import { useOnboardingColumns } from "./use-onboarding-columns";
import { useOnboardingCreate } from "./use-onboarding-create";
import { useOnboardingDescribe } from "./use-onboarding-describe";
import { useOnboardingFinish } from "./use-onboarding-finish";
import { useOnboardingWidgets } from "./use-onboarding-widgets";

const DESCRIPTION_MAX = 1000;

/** The workspace the cards step works on, once it exists. */
type Created = {
  workspaceId: string;
  spreadsheetId: string;
  rowCount: number | null;
};

/**
 * The wizard's state machine. Four screens: `upload` (the file; described
 * as soon as it is picked), `review` (the AI's name, label and description,
 * edited), `columns` (the AI's proposals, edited, then the workspace is
 * created) and `widgets` (the cards, then Run AI). The workspace exists from
 * the columns step on, so a reload resumes at the cards step from
 * `workspace.list` — the flag is still false until Run AI, which keeps the
 * gate from redirecting.
 */
export function useOnboardingWizard() {
  const trpc = useTRPC();
  const workspaces = useQuery(trpc.workspace.list.queryOptions());

  const [stage, setStage] =
    useState<Exclude<OnboardingStage, "widgets">>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [touched, setTouched] = useState({
    name: false,
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
    if (!touched.name) setName(result.suggestedName);
    if (!touched.description) setDescription(result.description);
    if (!touched.purpose) setPurpose(result.purpose);
  });
  const columns = useOnboardingColumns();
  const create = useOnboardingCreate((result) =>
    setCreated({
      workspaceId: result.workspace.id,
      spreadsheetId: result.spreadsheet.id,
      rowCount: result.import.rowCount,
    }),
  );

  const resumed = workspaces.data?.[0];
  const active: Created | null =
    created ??
    (resumed?.spreadsheetId
      ? {
          workspaceId: resumed.id,
          spreadsheetId: resumed.spreadsheetId,
          rowCount: null,
        }
      : null);
  const widgets = useOnboardingWidgets(
    active?.workspaceId ?? "",
    active?.spreadsheetId ?? "",
  );
  const finish = useOnboardingFinish(
    active?.workspaceId ?? "",
    active?.spreadsheetId ?? "",
  );
  const currentStage: OnboardingStage = active ? "widgets" : stage;

  const pickFile = useCallback(
    (picked: File) => {
      describe.reset();
      setFile(picked);
      setDescribed(null);
      setName(workspaceNameFromFile(picked.name));
      setDescription("");
      setPurpose("");
      setTouched({ name: false, description: false, purpose: false });
      describe.run(picked);
    },
    [describe],
  );

  const suggestInput = (nextDescription: string) =>
    described && file
      ? {
          name: name.trim() || workspaceNameFromFile(file.name) || "Workspace",
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
    create.isPending ||
    widgets.isRecommending ||
    finish.isPending;
  const progress = progressFor({
    stage: currentStage,
    hasFile: file !== null || active !== null,
    isDescribing: describe.isPending,
    isDescribed: described !== null || active !== null,
    isSuggesting: columns.isPending,
    isCreating: create.isPending,
    isCreated: active !== null,
    isRecommending: widgets.isRecommending || widgets.isLoadingColumns,
    isRunning: finish.isPending,
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
      setName: (value: string) => {
        setName(value);
        setTouched((current) => ({ ...current, name: true }));
      },
      setDescription: (value: string) => {
        setDescription(value);
        setTouched((current) => ({ ...current, description: true }));
      },
      setPurpose: (value: string) => {
        setPurpose(value);
        setTouched((current) => ({ ...current, purpose: true }));
      },
      pickFile,
      submitUpload: () => {
        if (file) setStage("review");
      },
      isDescribing: describe.isPending,
      described,
      errorKey: describe.errorKey,
      canContinue: file !== null && described !== null && !describe.isPending,
      continue: continueReview,
      /** One screen back: review → upload, columns → review. Not past a created workspace. */
      back: () => setStage(stage === "columns" ? "review" : "upload"),
      canGoBack:
        currentStage !== "widgets" && !columns.isPending && !create.isPending,
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
    widgets: {
      ...widgets,
      rowCount: active?.rowCount ?? null,
      run: () => finish.run(widgets.drafts),
      isRunning: finish.isPending,
      runErrorKey: finish.errorKey,
    },
  };
}

export type OnboardingWizardApi = ReturnType<typeof useOnboardingWizard>;
