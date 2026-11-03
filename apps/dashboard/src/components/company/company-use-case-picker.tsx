"use client";

import { ChoiceCard } from "@reclit/ui/choice-card";
import { cn } from "@reclit/ui/cn";
import { Input } from "@reclit/ui/input";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { FormField } from "@/components/common/form-field";
import { useCaseOptions } from "@/config/use-cases";
import { COMPANY_LIMITS, type UseCase } from "@/lib/company/api";
import { toggleUseCase } from "@/lib/company/use-cases";

type CompanyUseCasePickerProps = {
  picked: readonly UseCase[];
  other: string;
  onPickedChange: (picked: UseCase[]) => void;
  onOtherChange: (other: string) => void;
  /** Fires when the "Other" field loses focus — Settings saves it then. */
  onOtherBlur?: () => void;
  /** `default`: the onboarding grid of cards. `compact`: Settings' row of pills. */
  size?: "default" | "compact";
  disabled?: boolean;
  /** The heading that names the group. */
  labelledBy?: string;
};

/**
 * The six use cases as checkable cards — several may be picked — and the
 * "Other" field, shown while Other is picked. Onboarding's purpose screen
 * and Settings' company section share it.
 */
export function CompanyUseCasePicker({
  picked,
  other,
  onPickedChange,
  onOtherChange,
  onOtherBlur,
  size = "default",
  disabled = false,
  labelledBy,
}: CompanyUseCasePickerProps) {
  const t = useTranslations("company.useCases");
  const otherId = useId();
  const compact = size === "compact";

  return (
    <div className="space-y-4">
      <div
        aria-labelledby={labelledBy}
        className={cn(
          compact ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2",
        )}
        role="group"
      >
        {useCaseOptions.map((option) => (
          <ChoiceCard
            checked={picked.includes(option.key)}
            description={t(`${option.messageKey}.description`)}
            disabled={disabled}
            icon={option.icon}
            key={option.key}
            onCheckedChange={() =>
              onPickedChange(toggleUseCase(picked, option.key))
            }
            size={size}
            title={t(`${option.messageKey}.title`)}
          />
        ))}
      </div>
      {picked.includes("OTHER") && (
        <FormField htmlFor={otherId} label={t("otherLabel")}>
          <Input
            autoFocus={!compact}
            disabled={disabled}
            id={otherId}
            maxLength={COMPANY_LIMITS.useCaseOther}
            onBlur={onOtherBlur}
            onChange={(event) => onOtherChange(event.target.value)}
            placeholder={t("otherPlaceholder")}
            value={other}
          />
        </FormField>
      )}
    </div>
  );
}
