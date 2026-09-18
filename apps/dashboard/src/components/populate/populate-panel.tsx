"use client";

import { Button } from "@reclit/ui/button";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { formPath } from "@/config/populate";
import { PopulateApiCard } from "./populate-api-card";
import { useCopy } from "./use-copy";

/**
 * The two Populate cards: the public form link and the API. Both address the
 * active workspace's spreadsheet, so switching workspaces switches them.
 * Client component for the clipboard; the absolute URL needs
 * `location.origin`, so it starts as the bare path and fills in after mount to
 * keep hydration clean.
 */
export function PopulatePanel() {
  const t = useTranslations("populate");
  const { activeWorkspace } = useWorkspace();
  const [origin, setOrigin] = useState("");
  const { copied, copy } = useCopy();

  useEffect(() => setOrigin(window.location.origin), []);

  const spreadsheetId = activeWorkspace?.spreadsheetId ?? null;
  const path = spreadsheetId ? formPath(spreadsheetId) : null;
  const url = path ? `${origin}${path}` : null;

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
            onClick={() => url && void copy(url)}
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

      <section className="space-y-4 rounded-sm border bg-card p-6">
        <header className="space-y-1">
          <h2 className="text-heading">{t("api.title")}</h2>
          <p className="text-body text-muted-foreground">
            {t("api.description")}
          </p>
        </header>
        {spreadsheetId ? (
          <PopulateApiCard spreadsheetId={spreadsheetId} />
        ) : (
          <p className="text-body text-muted-foreground">{t("api.noSheet")}</p>
        )}
      </section>
    </div>
  );
}
