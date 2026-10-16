"use client";

import { Button } from "@reclit/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from "@reclit/ui/tooltip";
import type { PageAction } from "./assistant-provider";

/**
 * The capsule's right-hand pill: the one action the current page offers —
 * the sheet's "Run AI", shown only while the selection holds AI cells it can
 * run. Outlined in the primary colour, still; while the request is on its
 * way it reads "Starting…" and refuses clicks. The count lives in
 * `description` ("Run 3 cells"): the accessible name and the tooltip.
 */
export function AssistantRunAction({ action }: { action: PageAction }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={action.description}
            className="shrink-0"
            disabled={action.busy}
            onClick={action.onRun}
            size="sm"
            type="button"
            variant="island-outline"
          >
            {action.busy ? action.description : action.label}
          </Button>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom">{action.description}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
