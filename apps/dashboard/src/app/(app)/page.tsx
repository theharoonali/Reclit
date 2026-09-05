import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/common/page-shell";
import { DashboardEmpty } from "@/components/dashboard/dashboard-empty";

export default async function Page() {
  const t = await getTranslations("dashboard");

  return (
    <PageShell description={t("subtitle")} title={t("title")}>
      <DashboardEmpty />
    </PageShell>
  );
}
