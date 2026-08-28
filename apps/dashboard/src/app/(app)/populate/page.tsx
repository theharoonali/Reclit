import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PopulatePanel } from "@/components/populate/populate-panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("populate");
  return { title: t("title"), description: t("description") };
}

export default async function Page() {
  const t = await getTranslations("populate");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 md:px-8">
      <header className="space-y-1">
        <h1 className="text-title">{t("title")}</h1>
        <p className="text-subtitle text-muted-foreground">
          {t("description")}
        </p>
      </header>

      <PopulatePanel />
    </div>
  );
}
