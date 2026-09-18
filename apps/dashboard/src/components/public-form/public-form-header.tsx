/**
 * The public page's header: the spreadsheet's name over a bottom border, in
 * the dashboard header's geometry (`components/layout/app-header.tsx`). Local
 * markup because the header outlets exist only under `(app)`.
 */
export function PublicFormHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-header shrink-0 items-center border-b border-border bg-background px-4 md:px-6">
      <h1 className="truncate text-heading">{title}</h1>
    </header>
  );
}
