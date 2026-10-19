import { toRows } from "@reclit/dashboard-engine";
import type { ReactNode } from "react";

/**
 * The dashboard laid out from its config: one 12-column grid per `row`,
 * widgets left → right by `sort`, each spanning its `column`. Rows are
 * separate grids so a row that fills fewer than 12 columns leaves the rest
 * empty. Below `lg` every widget takes the full width. `renderCard` draws
 * each item (a stored card, or a proposed one in the recommendations) and
 * owns its key.
 */
export function DashboardGrid<T extends { row: number; sort: number }>({
  widgets,
  renderCard,
}: {
  widgets: T[];
  renderCard: (widget: T) => ReactNode;
}) {
  const rows = toRows(widgets);

  return (
    <div className="space-y-4">
      {rows.map(({ row, widgets: items }) => (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12" key={row}>
          {items.map(renderCard)}
        </section>
      ))}
    </div>
  );
}
