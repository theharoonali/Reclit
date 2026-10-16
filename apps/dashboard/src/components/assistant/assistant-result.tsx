"use client";

import { Button } from "@reclit/ui/button";
import { cn } from "@reclit/ui/cn";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AssistantErrorKey, TerminalStatus } from "@/lib/assistant/types";

/**
 * One line and a dismiss ×: how a run ended (done with the model's summary,
 * failed, cancelled), why something could not start (`errorKey`, which wins
 * when set), or a message the page already resolved (`message` — the
 * sheet's Run refusals). A failure or an error is an alert; the rest is
 * status. The server's own English error message is never shown — only the
 * key.
 */
export function AssistantResult({
  status,
  summary,
  errorKey,
  message = null,
  onDismiss,
}: {
  status: TerminalStatus | null;
  summary: string | null;
  errorKey: AssistantErrorKey | null;
  message?: string | null;
  onDismiss: () => void;
}) {
  const t = useTranslations("assistant");

  let text: string;
  if (errorKey) text = t(`errors.${errorKey}`);
  else if (message !== null) text = message;
  else if (status === "completed") text = summary ?? t("result.done");
  else if (status === "failed") text = t("result.failed");
  else text = t("result.cancelled");

  const isAlert = errorKey !== null || message !== null || status === "failed";

  return (
    <>
      <p
        className={cn(
          "min-w-0 flex-1 truncate text-label",
          isAlert && "text-destructive",
          status === "cancelled" && !errorKey && "opacity-70",
        )}
        role={isAlert ? "alert" : "status"}
      >
        {text}
      </p>
      <Button
        aria-label={t("result.dismiss")}
        onClick={onDismiss}
        size="icon-sm"
        type="button"
        variant="island"
      >
        <X aria-hidden="true" />
      </Button>
    </>
  );
}
