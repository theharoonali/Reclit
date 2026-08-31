"use client";

import { Button } from "@reclit/ui/button";
import { Download } from "lucide-react";
import { HeaderActions } from "@/components/layout/header-actions";

type AiSpreadsheetExportButtonProps = {
  label: string;
  onExport: () => void;
};

/**
 * The Export control, portalled into the app header next to Import
 * (`docs/rules/FRONTEND.md` — page controls live in the header, not a second
 * bar). Purely presentational: the grid owns the CSV serialisation and the
 * download, because only it holds the model ref.
 */
export function AiSpreadsheetExportButton(
  props: AiSpreadsheetExportButtonProps,
) {
  return (
    <HeaderActions>
      <Button
        onClick={props.onExport}
        size="sm"
        type="button"
        variant="outline"
      >
        <Download aria-hidden="true" />
        {props.label}
      </Button>
    </HeaderActions>
  );
}
