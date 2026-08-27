"use client";

import { Button } from "@reclit/ui/button";
import { Calendar } from "@reclit/ui/calendar";
import { useState } from "react";
import type { CellValue } from "@/lib/ai-spreadsheet/types";

type AiSpreadsheetDateEditorProps = {
  value: CellValue;
  labels: {
    clear: string;
    empty: string;
    previousMonth: string;
    nextMonth: string;
  };
  onChange: (value: string | null) => void;
};

/**
 * The calendar behind a date cell. Mount it with a `key` tied to the cell so
 * switching cells re-seeds the draft.
 *
 * Everything here is UTC, matching how the grid paints dates: the wire format
 * is ISO-8601 with a `Z`, and a calendar that quietly shifted a row's date by
 * the viewer's offset would make the same sheet read differently in two
 * offices. `react-day-picker` is told the same, via `timeZone`.
 */
export function AiSpreadsheetDateEditor(props: AiSpreadsheetDateEditorProps) {
  const { labels } = props;
  const [selected, setSelected] = useState(() => toDate(props.value));
  const [seed, setSeed] = useState(props.value);

  // The panel outlives a single opening — it stays mounted so it can animate
  // out, and its key is the cell — so the same cell reopening does not remount
  // this. Re-seed when the cell changed underneath us instead, which is what
  // happens when it was cleared or retyped in the grid between openings.
  if (seed !== props.value) {
    setSeed(props.value);
    setSelected(toDate(props.value));
  }

  const handleSelect = (day: Date | undefined) => {
    // `mode="single"` reports `undefined` when the selected day is clicked
    // again. Clearing is the Clear button's job, so that is a no-op here.
    if (!day) return;
    const next = withTimeOf(day, props.value);
    setSelected(day);
    setSeed(next);
    props.onChange(next);
  };

  const handleClear = () => {
    setSelected(undefined);
    setSeed(null);
    props.onChange(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <Calendar
        // Without this the calendar opens on the current month whatever the
        // cell holds: it derives the month from `defaultMonth`, never from
        // `selected`.
        defaultMonth={selected}
        labels={{
          labelPrevious: () => labels.previousMonth,
          labelNext: () => labels.nextMonth,
        }}
        mode="single"
        onSelect={handleSelect}
        selected={selected}
        timeZone="UTC"
      />

      {selected ? (
        <Button onClick={handleClear} type="button" variant="ghost">
          {labels.clear}
        </Button>
      ) : (
        <p className="text-body text-muted-foreground">{labels.empty}</p>
      )}
    </div>
  );
}

/** The cell's value as a Date, or undefined when it is blank or unparseable. */
function toDate(value: CellValue): Date | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : undefined;
}

/**
 * The picked day, carrying over the time of day the cell already held.
 *
 * The grid only ever paints the date part, so zeroing the time on every pick
 * would be data loss the user could not see. A blank or unparseable previous
 * value starts at midnight UTC instead.
 */
function withTimeOf(day: Date, previous: CellValue): string {
  const before = toDate(previous);
  const picked = new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      before?.getUTCHours() ?? 0,
      before?.getUTCMinutes() ?? 0,
      before?.getUTCSeconds() ?? 0,
      before?.getUTCMilliseconds() ?? 0,
    ),
  );
  return picked.toISOString();
}
