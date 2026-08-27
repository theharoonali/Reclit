import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AiSpreadsheetGrid } from "@/components/ai-spreadsheet/ai-spreadsheet-grid";
import { SAMPLE_PAYLOAD } from "@/components/ai-spreadsheet/sample-payload";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aiSpreadsheet");
  return { title: t("title"), description: t("description") };
}

export default function Page() {
  // Full bleed, like /resume: the sheet owns the whole content area and its
  // own scrolling. `h-full` resolves because <main> has a definite height
  // inside the shell's fixed-height column.
  return (
    <div className="h-full">
      <AiSpreadsheetGrid payload={SAMPLE_PAYLOAD} />
    </div>
  );
}
