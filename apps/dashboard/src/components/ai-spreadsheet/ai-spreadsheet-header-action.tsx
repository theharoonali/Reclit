"use client";

import { Button, type ButtonProps } from "@reclit/ui/button";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { HeaderActions } from "@/components/layout/header-actions";

type AiSpreadsheetHeaderActionProps = {
  icon: LucideIcon;
  label: string;
  variant: NonNullable<ButtonProps["variant"]>;
  onClick: () => void;
  disabled?: boolean;
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
  const { icon: Icon } = props;
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

      <Button
        aria-pressed={props.pressed}
        disabled={props.disabled}
        onClick={props.onClick}
        size="sm"
        type="button"
        variant={props.variant}
      >
        <Icon aria-hidden="true" />
        {props.label}
      </Button>
    </HeaderActions>
  );
}
