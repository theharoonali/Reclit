import { getDashboard } from "@/dummy-data/dashboard-store";
import { toRows } from "@/lib/dashboard/layout";
import { DashboardWidget } from "./dashboard-widget";

/**
 * The dashboard, laid out entirely from `getDashboard()`: one 12-column grid
 * per `row`, widgets left → right by `sort`, each spanning its `column`.
 * Rows are separate grids so a row that fills fewer than 12 columns leaves
 * the rest empty. Below `lg` every widget takes the full width.
 */
export function DashboardGrid() {
  const rows = toRows(getDashboard().widgets);

  return (
    <div className="space-y-4">
      {rows.map(({ row, widgets }) => (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12" key={row}>
          {widgets.map((widget) => (
            <DashboardWidget key={widget.id} widget={widget} />
          ))}
        </section>
      ))}
    </div>
  );
}
