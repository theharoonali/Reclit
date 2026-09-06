"use client";

import { Play, Radio } from "lucide-react";
import { AiSpreadsheetHeaderAction } from "./ai-spreadsheet-header-action";
import type { RunCellsStatus } from "./use-run-cells";

type AiSpreadsheetRunButtonProps = {
  /** The selection holds an AI cell with a prompt and none of its targets is working. */
  runnable: boolean;
  /** The sheet is streaming: at least one run is working. */
  live: boolean;
  status: RunCellsStatus;
  /** Already resolved to copy — this component maps no error codes. */
  errorMessage: string | null;
  /** `start` already says how many cells when there is more than one. */
  labels: { start: string; running: string };
  onRun: () => void;
};

/**
 * The Run control. Runs the AI cells of the selected rectangle — each row a
 * series, the rows a batch; enabled only while the selection holds such a
 * cell and none of them is already working. Filled with the live glyph while
 * the sheet streams, but never inert for that reason — other cells can be
 * run meanwhile, and the database refuses a second run on the same cell.
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
