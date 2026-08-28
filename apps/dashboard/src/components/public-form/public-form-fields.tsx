"use client";

import { Button } from "@reclit/ui/button";
import { Checkbox } from "@reclit/ui/checkbox";
import { Input } from "@reclit/ui/input";
import { Label } from "@reclit/ui/label";
import { Textarea } from "@reclit/ui/textarea";
import { useRef } from "react";
import {
  emptyDraft,
  type FieldDraft,
  type FormColumn,
  type FormDraft,
} from "@/lib/public-form";

type PublicFormFieldsProps = {
  columns: FormColumn[];
  draft: FormDraft;
  /** Per-column error message, keyed by column index. Already translated. */
  errors: Record<number, string>;
  labels: {
    choose: string;
    chooseAudio: string;
    replace: string;
    remove: string;
  };
  onChange: (columnIndex: number, field: FieldDraft) => void;
};

const INPUT_TYPES: Partial<Record<FormColumn["type"], string>> = {
  string: "text",
  number: "number",
  date: "date",
  email: "email",
  url: "url",
};

/**
 * One field per column, keyed by the column's wire type. Presentational —
 * validation, upload, and copy all live in the panel; column names render
 * as-is (they are data, not copy).
 */
export function PublicFormFields({
  columns,
  draft,
  errors,
  labels,
  onChange,
}: PublicFormFieldsProps) {
  return (
    <div className="space-y-5">
      {columns.map((column) => {
        const field = draft[column.index] ?? emptyDraft();
        const error = errors[column.index];
        const inputId = `field-${column.index}`;
        const errorId = `field-${column.index}-error`;

        return (
          <div className="space-y-2" key={column.id}>
            {column.type === "boolean" ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={field.checked}
                  id={inputId}
                  onCheckedChange={(checked) =>
                    onChange(column.index, {
                      ...field,
                      checked: checked === true,
                    })
                  }
                />
                <Label htmlFor={inputId}>{column.name}</Label>
              </div>
            ) : (
              <>
                <Label htmlFor={inputId}>{column.name}</Label>
                {column.type === "json" ? (
                  <Textarea
                    aria-describedby={error ? errorId : undefined}
                    aria-invalid={error ? true : undefined}
                    id={inputId}
                    onChange={(event) =>
                      onChange(column.index, {
                        ...field,
                        raw: event.target.value,
                      })
                    }
                    placeholder='{"key": "value"}'
                    value={field.raw}
                  />
                ) : column.type === "audio" || column.type === "file" ? (
                  <FileField
                    accept={column.type === "audio" ? "audio/*" : undefined}
                    chooseLabel={
                      column.type === "audio"
                        ? labels.chooseAudio
                        : labels.choose
                    }
                    field={field}
                    inputId={inputId}
                    labels={labels}
                    onChange={(next) => onChange(column.index, next)}
                  />
                ) : (
                  <Input
                    aria-describedby={error ? errorId : undefined}
                    aria-invalid={error ? true : undefined}
                    id={inputId}
                    onChange={(event) =>
                      onChange(column.index, {
                        ...field,
                        raw: event.target.value,
                      })
                    }
                    type={INPUT_TYPES[column.type] ?? "text"}
                    value={field.raw}
                  />
                )}
              </>
            )}

            {error && (
              <p
                className="text-caption text-destructive"
                id={errorId}
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A picked-not-yet-uploaded file behind a button; the panel uploads on submit. */
function FileField({
  accept,
  chooseLabel,
  field,
  inputId,
  labels,
  onChange,
}: {
  accept?: string;
  chooseLabel: string;
  field: FieldDraft;
  inputId: string;
  labels: { replace: string; remove: string };
  onChange: (field: FieldDraft) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        accept={accept}
        className="sr-only"
        id={inputId}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          if (file) onChange({ ...field, file });
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />
      <Button
        onClick={() => inputRef.current?.click()}
        type="button"
        variant="outline"
      >
        {field.file ? labels.replace : chooseLabel}
      </Button>
      {field.file && (
        <>
          <span className="truncate text-body text-muted-foreground">
            {field.file.name}
          </span>
          <Button
            onClick={() => onChange({ ...field, file: null })}
            type="button"
            variant="ghost"
          >
            {labels.remove}
          </Button>
        </>
      )}
    </div>
  );
}
