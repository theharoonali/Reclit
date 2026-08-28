import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PublicFormPanel } from "@/components/public-form/public-form-panel";

// The form reflects the sheet's live columns; never serve a build snapshot.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicForm");
  return { title: t("title"), description: t("description") };
}

/**
 * No server prefetch on purpose: this is a public URL, so unknown ids are an
 * expected input, and a dehydrated-pending query that rejects strands the
 * client in its loading state instead of surfacing the error. The panel
 * fetches client-side and owns loading/error/empty.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ spreadsheetId: string }>;
}) {
  const { spreadsheetId } = await params;

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <PublicFormPanel spreadsheetId={spreadsheetId} />
    </main>
  );
}
