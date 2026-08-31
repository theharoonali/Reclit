"use client";

import { Button } from "@reclit/ui/button";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { formPath } from "@/config/populate";

/**
 * The two Populate cards: the public form link and the API placeholder.
 * The link's id is the active workspace's spreadsheet id, so switching
 * workspaces switches the form. Client component for the clipboard; the
 * absolute URL needs `location.origin`, so it starts as the bare path and
 * fills in after mount to keep hydration clean.
 */
export function PopulatePanel() {
  const t = useTranslations("populate");
  const { activeWorkspace } = useWorkspace();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const spreadsheetId = activeWorkspace?.spreadsheetId ?? null;
  const path = spreadsheetId ? formPath(spreadsheetId) : null;
  const url = path ? `${origin}${path}` : null;

  const handleCopy = async () => {
    if (!url) return;
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
      <section className="space-y-4 rounded-sm border bg-card p-6">
        <header className="space-y-1">
          <h2 className="text-heading">{t("form.title")}</h2>
          <p className="text-body text-muted-foreground">
            {t("form.description")}
          </p>
        </header>

        <p className="break-all rounded-sm border bg-muted/50 px-3 py-2 font-mono text-body">
          {url ?? t("form.noSheet")}
        </p>

        <div className="flex gap-2">
          <Button
            disabled={!url}
            onClick={() => void handleCopy()}
            type="button"
            variant="outline"
          >
            {copied ? t("form.copied") : t("form.copy")}
          </Button>
          {path ? (
            <Button asChild variant="ghost">
              <a href={path} rel="noreferrer" target="_blank">
                {t("form.open")}
              </a>
            </Button>
          ) : (
            <Button disabled type="button" variant="ghost">
              {t("form.open")}
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-1 rounded-sm border bg-card p-6">
        <h2 className="text-heading">{t("api.title")}</h2>
        <div className="text-subtitle text-muted-foreground">
          {t("api.comingSoon")}
        </div>
      </section>
    </div>
  );
}
