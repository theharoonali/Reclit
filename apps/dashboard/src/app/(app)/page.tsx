import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/common/page-shell";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";

export default async function Page() {
  const t = await getTranslations("dashboard");

  return (
    <PageShell description={t("subtitle")} title={t("title")} wide>
      <DashboardGrid />
    </PageShell>
  );
}
