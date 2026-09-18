"use client";

import { Checkbox } from "@reclit/ui/checkbox";
import { cn } from "@reclit/ui/cn";
import { Input } from "@reclit/ui/input";
import { Label } from "@reclit/ui/label";
import { Textarea } from "@reclit/ui/textarea";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { FormField as LabelledField } from "@/components/common/form-field";
import {
  emptyDraft,
  type FieldDraft,
  type FormDraft,
  type FormField,
  isWideField,
} from "@/lib/public-form";
import { PublicFormFileField } from "./public-form-file-field";

type PublicFormFieldsProps = {
  fields: FormField[];
  draft: FormDraft;
  /** Per-column error message, keyed by column index. Already translated. */
  errors: Record<number, string>;
  onChange: (columnIndex: number, field: FieldDraft) => void;
  onPickFile: (columnIndex: number, file: File) => void;
  onRemoveFile: (columnIndex: number) => void;
};

const INPUT_TYPES: Partial<Record<FormField["type"], string>> = {
  string: "text",
  number: "number",
  date: "date",
  email: "email",
  url: "url",
};

/** `string` is the fallback: it names the column ("Enter Company"). */
const placeholderKey = (type: FormField["type"]) =>
  type === "number" || type === "email" || type === "url" ? type : "string";

/**
 * One field per column, two to a row from `md` up; JSON and file fields take
 * the whole row. Column names render as-is (they are data, not copy).
 */
export function PublicFormFields({ fields, ...rest }: PublicFormFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
      {fields.map((field) => (
        <PublicFormFieldItem field={field} key={field.columnIndex} {...rest} />
      ))}
    </div>
  );
}

function PublicFormFieldItem({
  field,
  draft,
  errors,
  onChange,
  onPickFile,
  onRemoveFile,
}: Omit<PublicFormFieldsProps, "fields"> & { field: FormField }) {
  const t = useTranslations("publicForm.placeholders");
  const inputId = useId();
  const errorId = useId();
  const { columnIndex, name, type } = field;
  const value = draft[columnIndex] ?? emptyDraft();
  const error = errors[columnIndex];
  const invalid = {
    "aria-describedby": error ? errorId : undefined,
    "aria-invalid": error ? (true as const) : undefined,
  };
  const setRaw = (raw: string) => onChange(columnIndex, { ...value, raw });

  if (type === "boolean") {
    return (
      // Sits on the control line of its neighbour, not on its label line.
      <div className="flex h-control items-center gap-2 self-end">
        <Checkbox
          checked={value.checked}
          id={inputId}
          onCheckedChange={(checked) =>
            onChange(columnIndex, { ...value, checked: checked === true })
          }
        />
        <Label htmlFor={inputId}>{name}</Label>
      </div>
    );
  }

  return (
    <div className={cn(isWideField(type) && "md:col-span-2")}>
      <LabelledField htmlFor={inputId} label={name}>
        {type === "json" ? (
          <Textarea
            {...invalid}
            id={inputId}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={t("json")}
            value={value.raw}
          />
        ) : type === "audio" || type === "file" ? (
          <PublicFormFileField
            audio={type === "audio"}
            errorId={errorId}
            inputId={inputId}
            onPick={(file) => onPickFile(columnIndex, file)}
            onRemove={() => onRemoveFile(columnIndex)}
            state={value.upload}
          />
        ) : (
          <Input
            {...invalid}
            id={inputId}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={
              type === "date" ? undefined : t(placeholderKey(type), { name })
            }
            type={INPUT_TYPES[type] ?? "text"}
            value={value.raw}
          />
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
      </LabelledField>
    </div>
  );
}
