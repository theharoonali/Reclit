"use client";

import { Button } from "@reclit/ui/button";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { formPath, POPULATE_FORM_SPREADSHEET_ID } from "@/config/populate";

const path = formPath(POPULATE_FORM_SPREADSHEET_ID);

/**
 * The two Populate cards: the public form link and the API placeholder.
 * Client component for the clipboard; the absolute URL needs `location.origin`,
 * so it starts as the bare path and fills in after mount to keep hydration
 * clean.
 */
export function PopulatePanel() {
  const t = useTranslations("populate");
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — the visible URL is still selectable.
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-lg border bg-card p-6">
        <header className="space-y-1">
          <h2 className="text-heading">{t("form.title")}</h2>
          <p className="text-body text-muted-foreground">
            {t("form.description")}
          </p>
        </header>

        <p className="break-all rounded-sm border bg-muted/50 px-3 py-2 font-mono text-body">
          {url}
        </p>

        <div className="flex gap-2">
          <Button
            onClick={() => void handleCopy()}
            type="button"
            variant="outline"
          >
            {copied ? t("form.copied") : t("form.copy")}
          </Button>
          <Button asChild variant="ghost">
            <a href={path} rel="noreferrer" target="_blank">
              {t("form.open")}
            </a>
          </Button>
        </div>
      </section>

      <section className="space-y-1 rounded-lg border bg-card p-6">
        <h2 className="text-heading">{t("api.title")}</h2>
        <div className="text-subtitle text-muted-foreground">
          {t("api.comingSoon")}
        </div>
      </section>
    </div>
  );
}
