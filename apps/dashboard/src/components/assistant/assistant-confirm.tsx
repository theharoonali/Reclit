"use client";

import { Button } from "@reclit/ui/button";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { confirmLabel } from "@/lib/assistant/step-label";
import type { PendingAction } from "@/lib/assistant/types";

/**
 * The capsule while a destructive step waits on the user: the question, then
 * two circles — a success-coloured check on a light success tint (confirm)
 * and a destructive-coloured cross on a light destructive tint (keep). Both
 * disable the moment an answer is recorded (`pendingAction.response`), so a
 * double click cannot answer twice while the run catches up.
 */
export function AssistantConfirm({
  action,
  onRespond,
}: {
  action: PendingAction;
  onRespond: (approved: boolean) => void;
}) {
  const t = useTranslations("assistant");
  const label = confirmLabel(action);
  const isAnswered = action.response !== null;

  return (
    <>
      <p aria-live="polite" className="min-w-0 flex-1 truncate text-label">
        {t(label.key, label.values)}
      </p>
      <Button
        aria-label={t("confirm.delete")}
        disabled={isAnswered}
        onClick={() => onRespond(true)}
        size="icon-sm"
        type="button"
        variant="island-success"
      >
        <Check aria-hidden="true" />
      </Button>
      <Button
        aria-label={t("confirm.keep")}
        disabled={isAnswered}
        onClick={() => onRespond(false)}
        size="icon-sm"
        type="button"
        variant="island-destructive"
      >
        <X aria-hidden="true" />
      </Button>
    </>
  );
}
