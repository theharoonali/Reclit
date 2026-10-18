"use client";

import { Button } from "@reclit/ui/button";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { RecommendedCard } from "./use-dashboard-recommendations";
import { useWidgetData } from "./use-widget-data";
import { WidgetCard } from "./widget-card";

/**
 * A proposed card: computed from the sheet exactly like a stored one (the
 * same `useWidgetData`, so it shares the sheet's fetch with the real cards)
 * and drawn in the same frame, with Add in its footer.
 */
export function DashboardRecommendationCard({
  card,
  spreadsheetId,
  isAdding,
  onAdd,
}: {
  card: RecommendedCard;
  spreadsheetId: string;
  isAdding: boolean;
  onAdd: () => void;
}) {
  const t = useTranslations("dashboard.recommendations");
  const source = useMemo(
    () => ({
      spreadsheetId,
      type: card.type,
      variant: card.variant,
      query: card.query,
    }),
    [spreadsheetId, card.type, card.variant, card.query],
  );
  const state = useWidgetData(source);

  return (
    <WidgetCard
      action={
        <Button
          disabled={isAdding}
          onClick={onAdd}
          size="sm"
          type="button"
          variant="secondary"
        >
          {isAdding ? t("adding") : t("add")}
        </Button>
      }
      state={state}
      widget={card}
    />
  );
}
