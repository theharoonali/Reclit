import {
  ClipboardList,
  Contact,
  type LucideIcon,
  Mail,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import type { UseCase } from "@/lib/company/api";
import { USE_CASES } from "@/lib/company/use-cases";

export type UseCaseConfig = {
  key: UseCase;
  icon: LucideIcon;
  /** Under `company.useCases.<messageKey>`: `.title` and `.description`. */
  messageKey: string;
};

const ICONS: Record<UseCase, LucideIcon> = {
  LEAD_RESEARCH: Target,
  HIRING: Users,
  EMAIL_OUTREACH: Mail,
  FORM_INTAKE: ClipboardList,
  CUSTOMER_INSIGHTS: Contact,
  OTHER: Sparkles,
};

const MESSAGE_KEYS: Record<UseCase, string> = {
  LEAD_RESEARCH: "leadResearch",
  HIRING: "hiring",
  EMAIL_OUTREACH: "emailOutreach",
  FORM_INTAKE: "formIntake",
  CUSTOMER_INSIGHTS: "customerInsights",
  OTHER: "other",
};

/** The use-case cards, in display order: the key, its icon and its message keys. */
export const useCaseOptions: readonly UseCaseConfig[] = USE_CASES.map(
  (key) => ({ key, icon: ICONS[key], messageKey: MESSAGE_KEYS[key] }),
);
