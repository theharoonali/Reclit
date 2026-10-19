"use client";

import {
  BUCKETS,
  type Bucket,
  type ColumnMeta,
  WIDGET_TYPES,
  type WidgetType,
} from "@reclit/dashboard-engine";
import { Input } from "@reclit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@reclit/ui/select";
import { useTranslations } from "next-intl";
import {
  setGroupBy,
  setType,
  variantsFor,
  type WidgetDraft,
} from "@/lib/onboarding/widget-draft";
import { OnboardingWidgetSeries } from "./onboarding-widget-series";

/** Radix `Select` reserves the empty string, so "no axis" is this value. */
const NO_AXIS = "__none__";

/** A card draft's fields, compact and unlabelled: title and subtitle, chart and style, x axis and bucket, the y series. */
export function OnboardingWidgetForm({
  draft,
  columns,
  disabled,
  onChange,
}: {
  draft: WidgetDraft;
  columns: readonly ColumnMeta[];
  disabled: boolean;
  onChange: (next: WidgetDraft) => void;
}) {
  const t = useTranslations("onboarding.widgets");
  const axis = draft.query.groupBy;
  const axisIsDate =
    axis !== null &&
    columns.find((c) => c.name === axis.column)?.type === "date";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          aria-label={t("name")}
          autoFocus
          disabled={disabled}
          maxLength={200}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder={t("namePlaceholder")}
          value={draft.name}
        />
        <Input
          aria-label={t("description")}
          disabled={disabled}
          maxLength={500}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value || null })
          }
          placeholder={t("descriptionPlaceholder")}
          value={draft.description ?? ""}
        />
        <Select
          disabled={disabled}
          onValueChange={(value) =>
            onChange(setType(draft, value as WidgetType))
          }
          value={draft.type}
        >
          <SelectTrigger aria-label={t("type")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WIDGET_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`types.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          disabled={disabled}
          onValueChange={(value) => onChange({ ...draft, variant: value })}
          value={draft.variant}
        >
          <SelectTrigger aria-label={t("variant")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {variantsFor(draft.type).map((variant) => (
              <SelectItem key={variant} value={variant}>
                {t(`variants.${variant}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {draft.type !== "stat" && (
          <Select
            disabled={disabled}
            onValueChange={(value) =>
              onChange(setGroupBy(draft, value === NO_AXIS ? null : value))
            }
            value={axis?.column ?? NO_AXIS}
          >
            <SelectTrigger aria-label={t("xAxis")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_AXIS}>{t("noAxis")}</SelectItem>
              {columns.map((column) => (
                <SelectItem key={column.name} value={column.name}>
                  {column.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {axis && axisIsDate && (
          <Select
            disabled={disabled}
            onValueChange={(value) =>
              onChange(setGroupBy(draft, axis.column, value as Bucket))
            }
            value={axis.bucket}
          >
            <SelectTrigger aria-label={t("bucket")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUCKETS.map((bucket) => (
                <SelectItem key={bucket} value={bucket}>
                  {t(`buckets.${bucket}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <OnboardingWidgetSeries
        disabled={disabled}
        draft={draft}
        onChange={onChange}
      />
    </div>
  );
}
