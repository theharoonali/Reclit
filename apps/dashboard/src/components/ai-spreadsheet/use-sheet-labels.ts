"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { createFormatters } from "@/lib/ai-spreadsheet/cell-format";
import {
  formatRunStatus,
  isKnownRunStatus,
} from "@/lib/ai-spreadsheet/run-status";
import type { SheetFormatters, SheetLabels } from "@/lib/ai-spreadsheet/types";

/**
 * Text and number formatting for the canvas.
 *
 * Canvas text is user-facing copy like any other, so the painters must not
 * invent it — but they also must not import next-intl, or every one of them
 * becomes a client component with a hook in it. Instead the strings are
 * resolved once here and handed down as plain data.
 *
 * The formatters are built once per locale for the same reason a paint pass
 * memoises text measurement: `toLocaleString()` per cell per frame is not free.
 */
export function useSheetLabels(): {
  labels: SheetLabels;
  formatters: SheetFormatters;
} {
  const t = useTranslations("aiSpreadsheet");
  const locale = useLocale();

  const labels = useMemo<SheetLabels>(
    () => ({
      boolTrue: t("boolean.true"),
      boolFalse: t("boolean.false"),
      jsonCapsule: (count: number) => t("capsule", { count }),
      jsonEmpty: t("json.empty"),
      // The four statuses the system assigns are copy; a custom stage the
      // backend reports ("analyzing") is data, shown tidied rather than
      // translated.
      runStatus: (status: string) =>
        isKnownRunStatus(status) ? t(`run.${status}`) : formatRunStatus(status),
      typeNames: {
        string: t("types.string"),
        number: t("types.number"),
        boolean: t("types.boolean"),
        date: t("types.date"),
        json: t("types.json"),
        formula: t("types.formula"),
        file: t("types.file"),
        audio: t("types.audio"),
        email: t("types.email"),
        url: t("types.url"),
      },
    }),
    [t],
  );

  const formatters = useMemo(() => createFormatters(locale), [locale]);

  return { labels, formatters };
}
