"use client";

import { Button } from "@reclit/ui/button";
import { Trash2 } from "lucide-react";
import { HeaderActions } from "@/components/layout/header-actions";

type AiSpreadsheetSelectionBarProps = {
  count: number;
  status: "idle" | "deleting" | "error";
  labels: { selected: string; delete: string; deleting: string; error: string };
  onDelete: () => void;
};

/**
 * The delete control for ticked rows, portalled into the app header next to
 * Import (`docs/rules/FRONTEND.md` — page controls live in the header, not a
 * second bar). Renders nothing while nothing is ticked, so the header stays
 * clean outside a selection.
 *
 * Presentational: the selection set and the mutation live in
 * `use-sheet-selection.ts`, owned by the grid.
 */
export function AiSpreadsheetSelectionBar(
  props: AiSpreadsheetSelectionBarProps,
) {
  if (props.count === 0) return null;

  return (
    <HeaderActions>
      {props.status === "error" && (
        <p
          className="hidden max-w-xs truncate text-caption text-destructive sm:block"
          role="alert"
        >
          {props.labels.error}
        </p>
      )}

      <span className="text-caption text-muted-foreground">
        {props.labels.selected}
      </span>

      <Button
        disabled={props.status === "deleting"}
        onClick={props.onDelete}
        size="sm"
        type="button"
        variant="destructive"
      >
        <Trash2 aria-hidden="true" />
        {props.status === "deleting"
          ? props.labels.deleting
          : props.labels.delete}
      </Button>
    </HeaderActions>
  );
}
