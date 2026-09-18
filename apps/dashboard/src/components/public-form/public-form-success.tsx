"use client";

import { Button } from "@reclit/ui/button";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

/** Shown once a submission is saved; the draft is already cleared. */
export function PublicFormSuccess({ onAgain }: { onAgain: () => void }) {
  const t = useTranslations("publicForm.success");

  return (
    <output className="flex flex-col items-center gap-4 rounded-sm border bg-card px-6 py-16 text-center">
      <span className="flex size-control-lg items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-icon" />
      </span>
      <div className="space-y-1">
        <h2 className="text-heading">{t("title")}</h2>
        <p className="text-body text-muted-foreground">{t("description")}</p>
      </div>
      <Button onClick={onAgain} type="button" variant="outline">
        {t("again")}
      </Button>
    </output>
  );
}
