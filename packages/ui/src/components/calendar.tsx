"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "../utils";
import { buttonVariants } from "./button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * A month calendar, rendered inline.
 *
 * Every class name is supplied here rather than pulled from
 * `react-day-picker/style.css`, so the calendar is styled from the same tokens
 * as the rest of the app and follows the theme without a second stylesheet.
 *
 * With `navLayout="around"` the previous button, the caption and the next
 * button are *siblings* of the month grid, not nested in a header element, so
 * `month` is the grid that lays all four out: three columns for the header row
 * and a full-width row for the dates. Styling `month` as a column instead
 * stacks the chevrons above and below the month name.
 *
 * It is deliberately not wrapped in a popover. The AI spreadsheet renders it
 * directly inside its side panel, and a portalled, focus-trapping popover
 * fights that grid's hidden focus proxy — the same reason its column form uses
 * a native `<select>`.
 */
function Calendar({ className, classNames, ...props }: CalendarProps) {
  const navButton = cn(
    buttonVariants({ variant: "ghost", size: "icon" }),
    "h-7 w-7",
  );

  return (
    <DayPicker
      className={cn("w-fit", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "grid grid-cols-[auto_1fr_auto] items-center gap-y-2",
        month_caption: "flex h-7 items-center justify-center",
        caption_label: "text-label text-card-foreground",
        button_previous: navButton,
        button_next: navButton,
        month_grid: "col-span-3 w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 text-center text-caption font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "h-9 w-9 p-0",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 rounded-sm p-0 font-normal",
        ),
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground",
        today: "[&>button]:border [&>button]:border-primary",
        outside: "[&>button]:text-muted-foreground [&>button]:opacity-50",
        disabled: "[&>button]:pointer-events-none [&>button]:opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      navLayout="around"
      showOutsideDays
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
