import { Button } from "@reclit/ui/button";
import { LayoutGrid } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * The dashboard's only body content. It reads no data, so there is no loading
 * or error state to handle — the empty state is unconditional until the first
 * widget lands.
 */
export async function DashboardEmpty() {
  const t = await getTranslations("dashboard.empty");

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <LayoutGrid className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-subheading">{t("title")}</h2>
      <p className="mt-2 max-w-sm text-subtitle text-muted-foreground">
        {t("description")}
      </p>
      <Button size="sm" className="mt-6">
        {t("action")}
      </Button>
    </div>
  );
}
