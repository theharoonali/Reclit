import { getTranslations } from "next-intl/server";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";

// Reads live data (the workspace's dashboard config and its sheet).
export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("dashboard");

  return <DashboardPanel description={t("subtitle")} title={t("title")} />;
}
