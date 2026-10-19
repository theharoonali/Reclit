"use client";

import { Input } from "@reclit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@reclit/ui/select";
import { Textarea } from "@reclit/ui/textarea";
import { useTranslations } from "next-intl";
import { columnTypes } from "@/lib/ai-spreadsheet/cell-format";
import type { ColumnType } from "@/lib/ai-spreadsheet/types";
import {
  type ColumnDraftIssue,
  type ColumnDraftItem,
  setColumnMode,
} from "@/lib/onboarding/column-draft";

/** The types an AI column can answer with: what fits one value per row. */
const AI_COLUMN_TYPES: ColumnType[] = ["string", "number", "boolean", "date"];

/** A column draft's fields, compact and unlabelled: name, type and kind on one row, the prompt under them. */
export function OnboardingColumnForm({
  draft,
  issue,
  disabled,
  onChange,
}: {
  draft: ColumnDraftItem;
  issue: ColumnDraftIssue | null;
  disabled: boolean;
  onChange: (next: ColumnDraftItem) => void;
}) {
  const t = useTranslations("onboarding.columns");
  const typeNames = useTranslations("aiSpreadsheet.types");
  const isAi = draft.node !== null;
  const types = isAi ? AI_COLUMN_TYPES : columnTypes;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          aria-invalid={
            issue === "nameRequired" || issue === "nameTaken" ? true : undefined
          }
          aria-label={t("name")}
          autoFocus
          disabled={disabled}
          maxLength={200}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder={t("namePlaceholder")}
          value={draft.name}
        />
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            onChange({ ...draft, type: value as ColumnType })
          }
          value={draft.type}
        >
          <SelectTrigger aria-label={t("type")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((option) => (
              <SelectItem key={option} value={option}>
                {typeNames(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            onChange(setColumnMode(draft, value as "ai" | "plain"))
          }
          value={isAi ? "ai" : "plain"}
        >
          <SelectTrigger aria-label={t("mode")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ai">{t("ai")}</SelectItem>
            <SelectItem value="plain">{t("plain")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isAi && (
        <Textarea
          aria-invalid={issue === "promptRequired" ? true : undefined}
          aria-label={t("prompt")}
          disabled={disabled}
          maxLength={10_000}
          onChange={(event) =>
            onChange({ ...draft, prompt: event.target.value })
          }
          placeholder={t("promptPlaceholder")}
          rows={3}
          value={draft.prompt ?? ""}
        />
      )}
    </div>
  );
}
