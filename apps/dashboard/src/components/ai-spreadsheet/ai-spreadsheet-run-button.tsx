"use client";

import { Play, Radio } from "lucide-react";
import { AiSpreadsheetHeaderAction } from "./ai-spreadsheet-header-action";
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
 * The Run control. Runs the selected AI cell; enabled only while such a cell
 * is selected and not already working. Filled with the live glyph while the
 * sheet streams, but never inert for that reason — another AI cell can be run
 * meanwhile, and the database refuses a second run on the same cell.
 */
export function AiSpreadsheetRunButton(props: AiSpreadsheetRunButtonProps) {
  const busy = props.status === "running";

  return (
    <AiSpreadsheetHeaderAction
      disabled={!props.runnable || busy}
      errorMessage={props.errorMessage}
      icon={props.live ? Radio : Play}
      label={busy ? props.labels.running : props.labels.start}
      onClick={props.onRun}
      pressed={props.live}
      variant={props.live ? "default" : "outline"}
    />
  );
}
