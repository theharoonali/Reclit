"use client";

import { Button } from "@reclit/ui/button";
import { Trash2 } from "lucide-react";
import { HeaderActions } from "@/components/layout/header-actions";

type AiSpreadsheetCellClearButtonProps = {
  /** True once a cell is selected — the grid flips it, not per keystroke. */
  visible: boolean;
  label: string;
  onClear: () => void;
};

/**
 * The clear control for the cell selection, portalled into the app header
 * (`docs/rules/FRONTEND.md` — page controls live in the header, not a second
 * bar). Renders nothing until a cell has been selected.
 *
 * Presentational: the selection rectangle and the clearing live in
 * `use-cell-editor.ts`, owned by the grid.
 */
export function AiSpreadsheetCellClearButton(
  props: AiSpreadsheetCellClearButtonProps,
) {
  if (!props.visible) return null;

  return (
    <HeaderActions>
      <Button
        onClick={props.onClear}
        size="sm"
        type="button"
        variant="destructive-outline"
      >
        <Trash2 aria-hidden="true" />
        {props.label}
      </Button>
    </HeaderActions>
  );
}
