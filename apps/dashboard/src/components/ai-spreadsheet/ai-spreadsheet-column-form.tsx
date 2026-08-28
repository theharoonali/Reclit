"use client";

import { Button } from "@reclit/ui/button";
import { Input } from "@reclit/ui/input";
import { Label } from "@reclit/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@reclit/ui/select";
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
 * Name and type, for both adding and editing a column. Every control is a
 * shared `@reclit/ui` primitive — see `docs/rules/FRONTEND.md`.
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
        <Label htmlFor={nameId}>{labels.name}</Label>
        <Input
          autoFocus
          id={nameId}
          onChange={(event) => setName(event.target.value)}
          placeholder={labels.namePlaceholder}
          value={name}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={typeId}>{labels.type}</Label>
        <Select
          onValueChange={(value) => setType(value as ColumnType)}
          value={type}
        >
          <SelectTrigger id={typeId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columnTypes.map((option) => (
              <SelectItem key={option} value={option}>
                {labels.typeNames[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button disabled={name.trim() === ""} type="submit" variant="default">
          {labels.submit}
        </Button>
        <Button onClick={props.onCancel} type="button" variant="ghost">
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
