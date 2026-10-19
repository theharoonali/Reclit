"use client";

import { cn } from "@reclit/ui/cn";
import { Spinner } from "@reclit/ui/spinner";
import { useTranslations } from "next-intl";
import { AssistantOrb } from "@/components/assistant/assistant-orb";
import {
  formatRunStatus,
  isKnownRunStatus,
} from "@/lib/ai-spreadsheet/run-status";
import type { FormField } from "@/lib/public-form";
import {
  formatOutputValue,
  type OutputCell,
  type OutputState,
} from "@/lib/public-form-output";

/**
 * The right column of the public form when the sheet shows its output: the
 * AI orb, then one row per AI column — waiting, working with its stage, the
 * value once done, or why there is none.
 */
export function PublicFormOutput({
  outputs,
  state,
  isWorking,
  hasSubmission,
}: {
  outputs: readonly FormField[];
  state: OutputState;
  isWorking: boolean;
  hasSubmission: boolean;
}) {
  const t = useTranslations("publicForm.output");
  const tRun = useTranslations("aiSpreadsheet.run");
  const subtitle = isWorking
    ? t("working")
    : hasSubmission
      ? t("done")
      : t("waiting");

  const renderCell = (cell: OutputCell | undefined, type: string) => {
    switch (cell?.status) {
      case "working": {
        const stage = cell.stage ?? "pending";
        return (
          <p className="flex items-center gap-2 text-caption text-muted-foreground">
            <Spinner size="sm" />
            {isKnownRunStatus(stage) ? tRun(stage) : formatRunStatus(stage)}
          </p>
        );
      }
      case "done": {
        const { text, mono, bool } = formatOutputValue(cell.value, type);
        return (
          <p
            className={cn(
              "line-clamp-6 whitespace-pre-line text-body",
              mono && "font-mono text-caption",
            )}
          >
            {bool === null ? text : t(bool ? "yes" : "no")}
          </p>
        );
      }
      case "failed":
        return <p className="text-caption text-destructive">{t("failed")}</p>;
      case "skipped":
        return (
          <p className="text-caption text-muted-foreground">{t("skipped")}</p>
        );
      default:
        return (
          <p className="text-caption text-muted-foreground">
            {t("waitingCell")}
          </p>
        );
    }
  };

  return (
    <aside className="space-y-5 rounded-sm border bg-card p-6">
      <div className="flex items-center gap-3">
        <AssistantOrb
          className="size-orb-md"
          state={isWorking ? "running" : "idle"}
        />
        <div className="min-w-0">
          <h2 className="text-heading">{t("title")}</h2>
          <p className="text-caption text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {outputs.map((output) => (
          <li className="space-y-1 py-3" key={output.columnIndex}>
            <p className="text-label">{output.name}</p>
            {renderCell(state.get(output.columnIndex), output.type)}
          </li>
        ))}
      </ul>
    </aside>
  );
}
