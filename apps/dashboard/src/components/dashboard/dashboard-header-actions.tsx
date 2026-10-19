"use client";

import { useTranslations } from "next-intl";
import { HeaderActions } from "@/components/layout/header-actions";

/**
 * The dashboard's header line, portalled into the app header
 * (`docs/rules/FRONTEND.md`: page-level status lives there): "AI is filling
 * N cells…" while runs are working on the sheet, nothing otherwise. The
 * figures refresh on their own (`use-dashboard-live-rows.ts`), so there is
 * no Refresh control.
 */
export function DashboardHeaderActions({
  fillingCount,
}: {
  /** AI runs still working on the sheet; announced while above zero. */
  fillingCount: number;
}) {
  const t = useTranslations("dashboard");
  if (fillingCount === 0) return null;
  return (
    <HeaderActions>
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {t("filling", { count: fillingCount })}
      </p>
    </HeaderActions>
  );
}
