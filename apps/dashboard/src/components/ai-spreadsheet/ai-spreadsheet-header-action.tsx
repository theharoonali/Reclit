"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Button, type ButtonProps } from "@reclit/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from "@reclit/ui/tooltip";
import type { ReactNode } from "react";
import { HeaderActions } from "@/components/layout/header-actions";

type AiSpreadsheetHeaderActionProps = {
  /** A Hugeicons glyph — the sheet toolbar's icon set (FRONTEND.md). */
  icon: IconSvgElement;
  label: string;
  variant: NonNullable<ButtonProps["variant"]>;
  onClick: () => void;
  disabled?: boolean;
  /**
   * The icon alone, the label moved to the accessible name and a tooltip. For
   * the controls whose glyph says it all — Import, Export, the deletes.
   */
  iconOnly?: boolean;
  /**
   * A breathing halo behind the control: "this is the thing to press now". The
   * Run button wears it while the selection holds runnable AI cells.
   */
  highlight?: boolean;
  /** For a control that reads as a toggle — the Run button while the sheet streams. */
  pressed?: boolean;
  /** Already resolved to copy. Shown before the control, desktop only. */
  errorMessage?: string | null;
  /** Anything that rides along in the portal: a hidden file input, a count. */
  children?: ReactNode;
};

/**
 * One control in the app header, portalled from the sheet
 * (`docs/rules/FRONTEND.md` — page controls live in the header, not a second
 * bar). Every sheet control — Import, Export, Run, cell clear, row delete —
 * is this component with a different icon, label and variant, so the header
 * reads as one toolbar.
 *
 * Purely presentational: the grid owns every mutation and decides when a
 * control renders at all.
 */
export function AiSpreadsheetHeaderAction(
  props: AiSpreadsheetHeaderActionProps,
) {
  const button = (
    <Button
      aria-label={props.iconOnly ? props.label : undefined}
      aria-pressed={props.pressed}
      // Above the halo, which is a sibling painted behind it.
      className="relative"
      disabled={props.disabled}
      onClick={props.onClick}
      size={props.iconOnly ? "icon-sm" : "sm"}
      type="button"
      variant={props.variant}
    >
      <HugeiconsIcon aria-hidden="true" icon={props.icon} />
      {!props.iconOnly && props.label}
    </Button>
  );

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

      {props.children}

      <span className="relative inline-flex">
        {props.highlight && (
          <span
            aria-hidden="true"
            className="absolute -inset-1 animate-pulse rounded-sm bg-primary/30 motion-reduce:animate-none"
          />
        )}
        {props.iconOnly ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="bottom">{props.label}</TooltipContent>
              </TooltipPortal>
            </Tooltip>
          </TooltipProvider>
        ) : (
          button
        )}
      </span>
    </HeaderActions>
  );
}
