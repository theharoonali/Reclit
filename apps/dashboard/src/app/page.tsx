import { NotesPanel } from "@/components/notes-panel";
import { HydrateClient, prefetch, trpc } from "@/trpc/server";

// Live database data: never statically prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notes",
  description: "CRUD example backed by Postgres.",
};

export default function Page() {
  prefetch(trpc.note.list.queryOptions());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
        <p className="text-muted-foreground">
          A full CRUD round trip: Next.js to tRPC to NestJS to Postgres.
        </p>
      </header>

      <HydrateClient>
        <NotesPanel />
      </HydrateClient>
    </main>
  );
}
