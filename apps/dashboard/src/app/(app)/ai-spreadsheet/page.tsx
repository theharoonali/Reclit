import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AiSpreadsheetLoader } from "@/components/ai-spreadsheet/ai-spreadsheet-loader";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// The sheet reads live data; never serve a build-time snapshot.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aiSpreadsheet");
  return { title: t("title"), description: t("description") };
}

export default function Page() {
  prefetch(trpc.spreadsheet.list.queryOptions());

  // Full bleed: the sheet owns the whole content area and its
  // own scrolling. `h-full` resolves because <main> has a definite height
  // inside the shell's fixed-height column.
  return (
    <HydrateClient>
      <div className="h-full">
        <AiSpreadsheetLoader />
      </div>
    </HydrateClient>
  );
}
