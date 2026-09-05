import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/common/page-shell";
import { PopulatePanel } from "@/components/populate/populate-panel";
import { pageMetadata } from "@/i18n/metadata";

export const generateMetadata = () => pageMetadata("populate");

export default async function Page() {
  const t = await getTranslations("populate");

  return (
    <PageShell description={t("description")} narrow title={t("title")}>
      <PopulatePanel />
    </PageShell>
  );
}
