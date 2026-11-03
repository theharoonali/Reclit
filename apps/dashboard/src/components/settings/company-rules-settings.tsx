"use client";

import { Button } from "@reclit/ui/button";
import { Spinner } from "@reclit/ui/spinner";
import { Textarea } from "@reclit/ui/textarea";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { FormField } from "@/components/common/form-field";
import { useCompany } from "@/components/company/use-company";
import { useReseed } from "@/hooks/use-reseed";
import { COMPANY_LIMITS, type Company } from "@/lib/company/api";

/** The company rules: one field and Save, enabled once the text differs from the saved rules. */
export function CompanyRulesSettings({ company }: { company: Company }) {
  const t = useTranslations("settings.company");
  const tCompany = useTranslations("company");
  const id = useId();
  const { update } = useCompany();
  const [rules, setRules] = useState(company.rules ?? "");
  useReseed(company.rules ?? "", setRules);

  const next = rules.trim() === "" ? null : rules.trim();
  const isDirty = next !== company.rules;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isDirty && !update.isPending) void update.run({ rules: next });
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <FormField htmlFor={id} label={t("rulesLabel")}>
        <Textarea
          id={id}
          maxLength={COMPANY_LIMITS.rules}
          onChange={(event) => setRules(event.target.value)}
          placeholder={t("rulesPlaceholder")}
          rows={6}
          value={rules}
        />
      </FormField>
      <div className="flex items-center justify-end gap-3">
        {update.errorKey && (
          <p className="text-caption text-destructive" role="alert">
            {tCompany(`errors.${update.errorKey}`)}
          </p>
        )}
        <Button
          disabled={!isDirty || update.isPending}
          type="submit"
          variant="default"
        >
          {update.isPending && <Spinner size="sm" />}
          {update.isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
