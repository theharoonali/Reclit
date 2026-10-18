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
 * the sheet's "Run AI" while the selection holds AI cells, the dashboard's
 * "AI Recommendations" while it is empty. Outlined in the primary colour,
 * still; while the request is on its way, or the work is already running,
 * it shows its `description` ("Starting…", "Thinking…") and refuses clicks.
 * The count lives in `description` too ("Run 3 cells"): the accessible name
 * and the tooltip.
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
