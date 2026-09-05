"use client";

import { Button } from "@reclit/ui/button";
import { Play, Radio } from "lucide-react";
import { HeaderActions } from "@/components/layout/header-actions";
import type { RunCellStatus } from "./use-run-cell";

type AiSpreadsheetRunButtonProps = {
  /** The selected cell is an AI column with a prompt and is not already working. */
  runnable: boolean;
  /** The sheet is streaming: at least one run is working. */
  live: boolean;
  status: RunCellStatus;
  /** Already resolved to copy — this component maps no error codes. */
  errorMessage: string | null;
  labels: { start: string; running: string };
  onRun: () => void;
};

/**
 * The Run control, portalled into the app header beside Import and Export.
 * Runs the selected AI cell; enabled only while such a cell is selected and
 * not already working. Filled with the live glyph while the sheet streams,
 * but never inert for that reason — another AI cell can be run meanwhile,
 * and the database refuses a second run on the same cell.
 */
export function AiSpreadsheetRunButton(props: AiSpreadsheetRunButtonProps) {
  const busy = props.status === "running";
  return (
    <HeaderActions>
      {props.errorMessage && (
        <p
          className="hidden max-w-xs truncate text-caption text-destructive sm:block"
          role="alert"
        >
          {props.errorMessage}
        </p>
      )}

      <Button
        aria-pressed={props.live}
        disabled={!props.runnable || busy}
        onClick={props.onRun}
        size="sm"
        type="button"
        variant={props.live ? "default" : "outline"}
      >
        {props.live ? (
          <Radio aria-hidden="true" />
        ) : (
          <Play aria-hidden="true" />
        )}
        {busy ? props.labels.running : props.labels.start}
      </Button>
    </HeaderActions>
  );
}
