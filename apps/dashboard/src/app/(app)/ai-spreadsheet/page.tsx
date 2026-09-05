import { AiSpreadsheetLoader } from "@/components/ai-spreadsheet/ai-spreadsheet-loader";
import { pageMetadata } from "@/i18n/metadata";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// The sheet reads live data; never serve a build-time snapshot.
export const dynamic = "force-dynamic";

export const generateMetadata = () => pageMetadata("aiSpreadsheet");

export default function Page() {
  // The loader reads the active workspace's sheet; hydrate the provider's list.
  prefetch(trpc.workspace.list.queryOptions());

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
