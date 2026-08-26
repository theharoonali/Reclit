import { getTranslations } from "next-intl/server";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";

export default async function Page() {
  const t = await getTranslations("dashboard");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-subtitle text-muted-foreground">{t("subtitle")}</p>
      </header>

      <DashboardEmpty />
    </div>
  );
}
