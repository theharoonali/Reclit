import { PublicFormPanel } from "@/components/public-form/public-form-panel";
import { pageMetadata } from "@/i18n/metadata";

// The form reflects the sheet's live columns; never serve a build snapshot.
export const dynamic = "force-dynamic";

export const generateMetadata = () => pageMetadata("publicForm");

/**
 * No server prefetch on purpose: this is a public URL, so unknown ids are an
 * expected input, and a dehydrated-pending query that rejects strands the
 * client in its loading state instead of surfacing the error. The panel
 * fetches client-side and owns the header, loading/error/empty and `<main>`.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ spreadsheetId: string }>;
}) {
  const { spreadsheetId } = await params;

  return <PublicFormPanel spreadsheetId={spreadsheetId} />;
}
