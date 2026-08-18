import { HelloCard } from "@/components/hello-card";
import { getI18n } from "@/locales/server";

export default async function Page() {
  const t = await getI18n();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("home.title")}
        </h1>
        <p className="text-muted-foreground">{t("home.description")}</p>
      </div>

      <HelloCard />
    </main>
  );
}
