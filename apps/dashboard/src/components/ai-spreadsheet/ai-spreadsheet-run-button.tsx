"use client";

import { Button } from "@reclit/ui/button";
import { Play, Radio } from "lucide-react";
import { HeaderActions } from "@/components/layout/header-actions";

type AiSpreadsheetRunButtonProps = {
  /** The sheet is streaming: the button shows "Live" and cannot be pressed. */
  live: boolean;
  disabled: boolean;
  labels: { start: string; live: string };
  onRun: () => void;
};

/**
 * The Run control, portalled into the app header beside Import and Export.
 * Today it opens the run stream ahead of the first run (runs are then
 * created through the API); the same click will enqueue the sheet's AI
 * columns once execution exists. Filled and inert while the sheet is live,
 * so the state is visible at a glance and cannot be double-started.
 */
export function AiSpreadsheetRunButton(props: AiSpreadsheetRunButtonProps) {
  return (
    <HeaderActions>
      <Button
        aria-pressed={props.live}
        disabled={props.disabled || props.live}
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
        {props.live ? props.labels.live : props.labels.start}
      </Button>
    </HeaderActions>
  );
}
