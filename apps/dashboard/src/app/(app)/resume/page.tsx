import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResumeViewer } from "@/components/resume/resume-viewer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("resume");
  return { title: t("title"), description: t("description") };
}

export default function Page() {
  // Full bleed: no gutters, so the document uses the entire content area.
  // `h-full` resolves because <main> has a definite height inside the shell's
  // fixed-height column, which also keeps the viewer as the only scroll area.
  return (
    <div className="h-full">
      <ResumeViewer />
    </div>
  );
}
