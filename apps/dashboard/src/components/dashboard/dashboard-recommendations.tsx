"use client";

import { placeWidgets } from "@reclit/dashboard-engine";
import { Button } from "@reclit/ui/button";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { DashboardGrid } from "./dashboard-grid";
import { DashboardRecommendationCard } from "./dashboard-recommendation-card";
import type { DashboardRecommendationsApi } from "./use-dashboard-recommendations";

/**
 * The assistant's proposed cards, laid out as they will land — the engine's
 * `placeWidgets` gives each its slot in order, the same rule the api applies
 * on Add — with Add all and Dismiss above and Add on every card. An empty
 * set says so and offers only Dismiss.
 */
export function DashboardRecommendations({
  recommendations,
}: {
  recommendations: DashboardRecommendationsApi;
}) {
  const t = useTranslations("dashboard.recommendations");
  const { set, add, addAll, isAdding, isAddingAll, addError, dismiss } =
    recommendations;
  const placed = useMemo(() => {
    if (!set) return [];
    const slots = placeWidgets(set.cards.map((card) => card.column));
    return set.cards.map((card, index) => ({
      ...card,
      ...(slots[index] ?? { row: 0, sort: index }),
    }));
  }, [set]);

  if (!set) return null;
  const count = set.cards.length;

  return (
    <section aria-label={t("title")} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-heading">{t("title")}</h2>
          <p className="text-muted-foreground text-subtitle">
            {count === 0 ? t("empty") : t("subtitle", { count })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <Button
              disabled={isAddingAll}
              onClick={() => void addAll()}
              size="sm"
              type="button"
              variant="default"
            >
              {isAddingAll ? t("adding") : t("addAll")}
            </Button>
          )}
          <Button onClick={dismiss} size="sm" type="button" variant="ghost">
            {t("dismiss")}
          </Button>
        </div>
      </div>
      {addError && (
        <p className="text-caption text-destructive" role="alert">
          {addError}
        </p>
      )}
      <DashboardGrid
        renderCard={(card) => (
          <DashboardRecommendationCard
            card={card}
            isAdding={isAdding(card.key)}
            key={card.key}
            onAdd={() => void add(card.key)}
            spreadsheetId={set.spreadsheetId}
          />
        )}
        widgets={placed}
      />
    </section>
  );
}
