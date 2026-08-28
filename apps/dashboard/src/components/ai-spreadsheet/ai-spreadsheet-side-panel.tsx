"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { X } from "lucide-react";
import type { ReactNode } from "react";

type AiSpreadsheetSidePanelProps = {
  className?: string;
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The docked panel. It lives inside the row *below* the header, so it can
 * never cover the column names, and it overlays the sheet rather than sharing
 * a track with it — opening it must not resize or reflow the grid.
 *
 * It stays mounted and slides on `translate-x`, which is what makes closing as
 * smooth as opening: an unmounted element cannot animate out. The timing is
 * the app-wide `duration-smooth`/`ease-smooth` pair, shared with the sidebar.
 *
 * `data-sheet-panel` marks the subtree as "focus belongs here" for anything
 * that needs to distinguish panel focus from grid focus. While closed the
 * panel is inert — `pointer-events-none` and hidden from assistive tech — so
 * an off-screen form can never take a click or a tab stop.
 */
export function AiSpreadsheetSidePanel(props: AiSpreadsheetSidePanelProps) {
  return (
    <aside
      aria-hidden={!props.open}
      className={cn(
        "flex w-80 min-h-0 shrink-0 flex-col border-l border-border bg-card",
        "transition-transform duration-smooth ease-smooth",
        props.open
          ? "translate-x-0 shadow-lg"
          : "pointer-events-none translate-x-full",
        props.className,
      )}
      data-sheet-panel
      inert={!props.open}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="truncate text-subheading text-card-foreground">
          {props.title}
        </h2>
        <Button
          aria-label={props.closeLabel}
          onClick={props.onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {props.children}
      </div>
    </aside>
  );
}
