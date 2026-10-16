"use client";

import { Button } from "@reclit/ui/button";
import { useTranslations } from "next-intl";
import { confirmLabel } from "@/lib/assistant/step-label";
import type { PendingAction } from "@/lib/assistant/types";

/**
 * The capsule while a destructive step waits on the user: the question,
 * then Delete / Keep. Both buttons disable the moment an answer is recorded
 * (`pendingAction.response`), so a double click cannot answer twice while the
 * run catches up.
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
        disabled={isAnswered}
        onClick={() => onRespond(true)}
        size="sm"
        type="button"
        variant="destructive"
      >
        {t("confirm.delete")}
      </Button>
      <Button
        disabled={isAnswered}
        onClick={() => onRespond(false)}
        size="sm"
        type="button"
        variant="island"
      >
        {t("confirm.keep")}
      </Button>
    </>
  );
}
