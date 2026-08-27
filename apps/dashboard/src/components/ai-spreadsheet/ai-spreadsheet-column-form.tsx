"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { type FormEvent, useId, useState } from "react";
import { columnTypes } from "@/lib/ai-spreadsheet/cell-format";
import type { ColumnType, SheetColumn } from "@/lib/ai-spreadsheet/types";

type AiSpreadsheetColumnFormProps = {
  /** Absent means "add a new column". One component, both jobs. */
  column?: SheetColumn;
  labels: {
    name: string;
    namePlaceholder: string;
    type: string;
    submit: string;
    cancel: string;
    typeNames: Record<ColumnType, string>;
  };
  onSubmit: (name: string, type: ColumnType) => void;
  onCancel: () => void;
};

/**
 * The type picker is a native `<select>`, not a Radix one, and that is a
 * deliberate call rather than a shortcut. Radix Select portals its listbox and
 * traps focus; this grid keeps a hidden textarea focused and re-focuses it on
 * every pointerdown, and the two fight. Native has no portal, no focus trap,
 * and brings keyboard, type-ahead and screen-reader semantics for free.
 *
 * If a second feature ever needs a select, it moves to
 * `packages/ui/src/components/select.tsx` — still native, still unanimated.
 */
export function AiSpreadsheetColumnForm(props: AiSpreadsheetColumnFormProps) {
  const { column, labels } = props;
  const [name, setName] = useState(column?.name ?? "");
  const [type, setType] = useState<ColumnType>(column?.type ?? "string");
  const nameId = useId();
  const typeId = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;
    props.onSubmit(trimmed, type);
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <label className="text-label text-card-foreground" htmlFor={nameId}>
          {labels.name}
        </label>
        <Input
          autoFocus
          id={nameId}
          onChange={(event) => setName(event.target.value)}
          placeholder={labels.namePlaceholder}
          value={name}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-label text-card-foreground" htmlFor={typeId}>
          {labels.type}
        </label>
        <select
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-body text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          id={typeId}
          onChange={(event) => setType(event.target.value as ColumnType)}
          value={type}
        >
          {columnTypes.map((option) => (
            <option key={option} value={option}>
              {labels.typeNames[option]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Button disabled={name.trim() === ""} type="submit">
          {labels.submit}
        </Button>
        <Button onClick={props.onCancel} type="button" variant="ghost">
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
