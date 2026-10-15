import { Avatar, AvatarFallback } from "@reclit/ui/avatar";
import { Button } from "@reclit/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@reclit/ui/table";
import type {
  DashboardWidget,
  WidgetRecord,
  WidgetSeries,
} from "@/dummy-data/dashboard.schema";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Cell({
  series,
  record,
}: {
  series: WidgetSeries;
  record: WidgetRecord;
}) {
  const value = record[series.key];
  const text =
    typeof value === "number" ? value.toLocaleString() : (value ?? "");

  if (series.kind === "person") {
    return (
      <div className="flex items-center gap-3">
        <Avatar className="size-avatar-sm">
          <AvatarFallback>{initials(String(text))}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-label">{text}</p>
          {series.detailKey && (
            <p className="truncate text-caption text-muted-foreground">
              {record[series.detailKey]}
            </p>
          )}
        </div>
      </div>
    );
  }
  if (series.kind === "action") {
    return text ? (
      <Button size="sm" type="button" variant="outline">
        {text}
      </Button>
    ) : null;
  }
  return <>{text}</>;
}

/**
 * Records as table rows: one column per series, rendered by its `kind` —
 * `person` (avatar, name, `detailKey` line), `number`, `action` (the cell's
 * text as an outline button, no handler yet) or plain text.
 */
export function TableWidget({ widget }: { widget: DashboardWidget }) {
  const { data } = widget;
  const idKey = data.categoryKey ?? "";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {data.series.map((series) => (
            <TableHead key={series.key}>{series.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((record, index) => (
          <TableRow key={String(record[idKey] ?? index)}>
            {data.series.map((series) => (
              <TableCell key={series.key}>
                <Cell record={record} series={series} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
