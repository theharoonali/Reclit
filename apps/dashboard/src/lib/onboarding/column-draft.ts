import { isColumnNameTaken } from "@/lib/ai-spreadsheet/column-names";
import type { ColumnDraft } from "@/lib/ai-spreadsheet/types";
import type { OnboardingColumn } from "./api";

/**
 * The columns step's draft list: the AI's proposals and the user's own, each
 * editable, validated like the sheet's column form before the workspace is
 * created. Pure — the hook holds the state, these shape it.
 */
export type ColumnDraftItem = ColumnDraft & {
  key: string;
  /** Proposed by the AI, or added by the user. */
  source: "ai" | "user";
};

export type ColumnDraftIssue = "nameRequired" | "nameTaken" | "promptRequired";

/** The AI's proposals as drafts; `seed` keeps keys unique across re-suggests. */
export function fromSuggestions(
  columns: readonly {
    name: string;
    type: ColumnDraft["type"];
    prompt: string;
  }[],
  seed = 0,
): ColumnDraftItem[] {
  return columns.map((column, index) => ({
    key: `ai-${seed}-${index}`,
    source: "ai",
    name: column.name,
    type: column.type,
    node: "ai",
    prompt: column.prompt,
  }));
}

/** A blank AI column for the user to fill in. */
export function newAiColumn(key: string): ColumnDraftItem {
  return {
    key,
    source: "user",
    name: "",
    type: "string",
    node: "ai",
    prompt: "",
  };
}

/** A blank plain column. */
export function newPlainColumn(key: string): ColumnDraftItem {
  return {
    key,
    source: "user",
    name: "",
    type: "string",
    node: null,
    prompt: null,
  };
}

/** Switches a draft between an AI column and a plain one, keeping its name and type. */
export function setColumnMode(
  draft: ColumnDraftItem,
  mode: "ai" | "plain",
): ColumnDraftItem {
  return mode === "ai"
    ? { ...draft, node: "ai", prompt: draft.prompt ?? "" }
    : { ...draft, node: null, prompt: null };
}

/** The drafts as `POST /onboarding` takes them. */
export function toCreateColumns(
  drafts: readonly ColumnDraftItem[],
): OnboardingColumn[] {
  return drafts.map((draft) => ({
    name: draft.name.trim(),
    type: draft.type,
    node: draft.node,
    prompt: draft.node === null ? null : (draft.prompt ?? "").trim() || null,
  }));
}

/**
 * The first problem with each draft, keyed by draft key: a blank name, a
 * name the file or another draft already uses (trimmed, case-insensitive —
 * the sheet's rule), or an AI column without a prompt.
 */
export function columnDraftIssues(
  drafts: readonly ColumnDraftItem[],
  fileColumnNames: readonly string[],
): Record<string, ColumnDraftIssue | null> {
  const issues: Record<string, ColumnDraftIssue | null> = {};
  for (const draft of drafts) {
    const others = [
      ...fileColumnNames,
      ...drafts.filter((other) => other.key !== draft.key).map((o) => o.name),
    ];
    if (draft.name.trim() === "") issues[draft.key] = "nameRequired";
    else if (isColumnNameTaken(draft.name, others))
      issues[draft.key] = "nameTaken";
    else if (draft.node !== null && (draft.prompt ?? "").trim() === "")
      issues[draft.key] = "promptRequired";
    else issues[draft.key] = null;
  }
  return issues;
}

export function canCreate(
  issues: Record<string, ColumnDraftIssue | null>,
): boolean {
  return Object.values(issues).every((issue) => issue === null);
}
