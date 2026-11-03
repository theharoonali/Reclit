"use client";

import { useCompany } from "@/components/company/use-company";
import { useCompanyDocuments } from "@/components/company/use-company-documents";
import type { UseCase } from "@/lib/company/api";
import { isUseCaseChange, toUseCaseUpdate } from "@/lib/company/use-cases";
import { isSameWebsite } from "@/lib/company/website";

/** The stages these screens move to. */
type CompanyStep = "purpose" | "website" | "documents" | "name";

/**
 * The wizard's first three screens — purpose, website, documents — over the
 * account's company profile. Every step writes as it goes (the profile is
 * the account's, and exists before any workspace), so a reload with use
 * cases saved resumes at the workspace name. Each screen keeps its own draft
 * seeded from `company`; these handlers save it and move on.
 */
export function useOnboardingCompany(goTo: (step: CompanyStep) => void) {
  const api = useCompany({ live: true });
  const { company, update, setWebsite } = api;
  const documents = useCompanyDocuments(company?.documents ?? []);

  const resetErrors = () => {
    update.reset();
    setWebsite.reset();
  };
  const go = (step: CompanyStep) => {
    resetErrors();
    goTo(step);
  };

  /** Next on purpose: save the pick (unless unchanged), then the website. */
  const submitPurpose = async (picked: UseCase[], other: string) => {
    if (!company || picked.length === 0) return;
    if (isUseCaseChange(company, picked, other)) {
      if (!(await update.run(toUseCaseUpdate(picked, other)))) return;
    }
    go("website");
  };

  /**
   * Next on website: a new address is read (the card appears, the screen
   * stays); the saved one moves on to the documents.
   */
  const submitWebsite = async (url: string) => {
    if (!company || url.trim() === "") return;
    if (isSameWebsite(url, company.website)) {
      go("documents");
      return;
    }
    await setWebsite.run(url.trim());
  };

  /** Next on documents: save the rules (unless unchanged), then the name. */
  const submitDocuments = async (rules: string) => {
    if (!company) return;
    const next = rules.trim() === "" ? null : rules.trim();
    if (next !== company.rules) {
      if (!(await update.run({ rules: next }))) return;
    }
    go("name");
  };

  return {
    company,
    isPending: api.isPending,
    isError: api.isError,
    hasUseCases: (company?.useCases.length ?? 0) > 0,
    isWorking:
      update.isPending || setWebsite.isPending || documents.isUploading,
    isSaving: update.isPending,
    isScraping: setWebsite.isPending,
    updateErrorKey: update.errorKey,
    websiteErrorKey: setWebsite.errorKey,
    documents,
    resetErrors,
    submitPurpose: (picked: UseCase[], other: string) =>
      void submitPurpose(picked, other),
    submitWebsite: (url: string) => void submitWebsite(url),
    skipWebsite: () => go("documents"),
    saveSummary: (summary: string | null) => void update.run({ summary }),
    submitDocuments: (rules: string) => void submitDocuments(rules),
    skipDocuments: () => go("name"),
  };
}

export type OnboardingCompanyApi = ReturnType<typeof useOnboardingCompany>;
