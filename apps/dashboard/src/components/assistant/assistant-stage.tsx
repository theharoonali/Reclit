"use client";

import { Button } from "@reclit/ui/button";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { stepLabel } from "@/lib/assistant/step-label";
import type { AssistantRun } from "@/lib/assistant/types";

/**
 * The capsule while a run is alive: its stage — Queued, Thinking, or
 * "Working: <step>" for the step in progress — in a polite live region, and
 * the cancel ×. The step line is formatted from the server's identifiers by
 * `step-label.ts`; the model's own words never appear here.
 */
export function AssistantStage({
  run,
  onCancel,
}: {
  run: Pick<AssistantRun, "status" | "steps">;
  onCancel: () => void;
}) {
  const t = useTranslations("assistant");
  const current =
    run.steps.find((step) => step.status === "running") ??
    run.steps[run.steps.length - 1];

  let text: string;
  if (run.status === "pending") text = t("queued");
  else if (run.status === "working" && current) {
    const label = stepLabel(current);
    text = t("working", { step: t(label.key, label.values) });
  } else text = t("thinking");

  return (
    <>
      <p aria-live="polite" className="min-w-0 flex-1 truncate text-label">
        {text}
      </p>
      <Button
        aria-label={t("cancel")}
        onClick={onCancel}
        size="icon-sm"
        type="button"
        variant="island"
      >
        <X aria-hidden="true" />
      </Button>
    </>
  );
}
