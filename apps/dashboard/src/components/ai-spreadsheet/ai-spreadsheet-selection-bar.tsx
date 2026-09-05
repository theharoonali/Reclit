"use client";

import { Trash2 } from "lucide-react";
import { AiSpreadsheetHeaderAction } from "./ai-spreadsheet-header-action";

type AiSpreadsheetSelectionBarProps = {
  count: number;
  status: "idle" | "deleting" | "error";
  labels: { selected: string; delete: string; deleting: string; error: string };
  onDelete: () => void;
};

/**
 * The delete control for ticked rows, with the count beside it. Renders
 * nothing while nothing is ticked, so the header stays clean outside a
 * selection. Presentational: the selection set and the mutation live in
 * `use-sheet-selection.ts`, owned by the grid.
 */
export function AiSpreadsheetSelectionBar(
  props: AiSpreadsheetSelectionBarProps,
) {
  if (props.count === 0) return null;
  const deleting = props.status === "deleting";

  return (
    <AiSpreadsheetHeaderAction
      disabled={deleting}
      errorMessage={props.status === "error" ? props.labels.error : null}
      icon={Trash2}
      label={deleting ? props.labels.deleting : props.labels.delete}
      onClick={props.onDelete}
      variant="destructive"
    >
      <span className="text-caption text-muted-foreground">
        {props.labels.selected}
      </span>
    </AiSpreadsheetHeaderAction>
  );
}
