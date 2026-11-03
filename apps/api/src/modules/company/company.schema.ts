import { z } from "zod";
import { MAX_ATTACHMENT_BYTES } from "../../ai/cell-attachments";

// Single source of truth for the company profile shapes
// (docs/plans/043-company-profile.md). Enums are uppercase on the wire, as in
// the database: there is no case mapping to keep.

export const USE_CASES = [
  "LEAD_RESEARCH",
  "HIRING",
  "EMAIL_OUTREACH",
  "FORM_INTAKE",
  "CUSTOMER_INSIGHTS",
  "OTHER",
] as const;
export const useCaseSchema = z.enum(USE_CASES);
export type UseCase = z.infer<typeof useCaseSchema>;

export const companyCrawlStatusSchema = z.enum([
  "IDLE",
  "SCRAPING",
  "CRAWLING",
  "READY",
  "FAILED",
]);

export const companyDocumentStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "READY",
  "FAILED",
]);

/** What a company document may be: the files Gemini reads natively, plus text. */
export const COMPANY_DOCUMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;
/** The cell attachment cap: one file must fit a Gemini request inline. */
export const MAX_COMPANY_DOCUMENT_BYTES = MAX_ATTACHMENT_BYTES;
export const MAX_COMPANY_DOCUMENTS = 10;

export const MAX_COMPANY_NAME = 200;
export const MAX_USE_CASE_OTHER = 200;
export const MAX_COMPANY_SUMMARY = 4000;
export const MAX_COMPANY_RULES = 8000;

export const companyDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  status: companyDocumentStatusSchema,
  error: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CompanyDocument = z.infer<typeof companyDocumentSchema>;

export const companySchema = z.object({
  id: z.string(),
  useCases: z.array(useCaseSchema),
  useCaseOther: z.string().nullable(),
  website: z.string().nullable(),
  name: z.string().nullable(),
  iconUrl: z.string().nullable(),
  summary: z.string().nullable(),
  rules: z.string().nullable(),
  crawlStatus: companyCrawlStatusSchema,
  crawlError: z.string().nullable(),
  crawledAt: z.date().nullable(),
  /** Pages the last background crawl stored. */
  pageCount: z.number().int(),
  /** Oldest first. */
  documents: z.array(companyDocumentSchema),
  updatedAt: z.date(),
});
export type Company = z.infer<typeof companySchema>;

/* --------------------------------------------------------------- inputs */

/** Trimmed, capped, and blank means "clear it" — the same as `null`. */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === "" ? null : value));

export const updateCompanyInput = z
  .object({
    useCases: z
      .array(useCaseSchema)
      .max(USE_CASES.length)
      .refine((cases) => new Set(cases).size === cases.length, {
        message: "Use cases must be unique",
      }),
    useCaseOther: clearableText(MAX_USE_CASE_OTHER),
    name: clearableText(MAX_COMPANY_NAME),
    summary: clearableText(MAX_COMPANY_SUMMARY),
    rules: clearableText(MAX_COMPANY_RULES),
  })
  .partial();
export type UpdateCompanyInput = z.infer<typeof updateCompanyInput>;

export const setCompanyWebsiteInput = z.object({
  url: z.string().trim().min(1, "A website is required").max(2048),
});
export type SetCompanyWebsiteInput = z.infer<typeof setCompanyWebsiteInput>;

/** What `POST /files` answered for the upload, handed back as-is. */
export const addCompanyDocumentInput = z.object({
  url: z.string().trim().url().max(2048),
  name: z.string().trim().min(1, "A file name is required").max(255),
  /** May be blank: the file's extension decides then. */
  mimeType: z.string().trim().max(255),
  size: z.number().int().min(0),
});
export type AddCompanyDocumentInput = z.infer<typeof addCompanyDocumentInput>;

/* ------------------------------------------------- model answers (strict) */

/**
 * The strict twin of the lenient summary schema the model answers
 * (ai/company-ai.ts): trimmed, non-empty, cut to the column caps rather than
 * refused — a long summary is still a summary.
 */
export const companySummarySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.slice(0, MAX_COMPANY_NAME)),
  summary: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.slice(0, MAX_COMPANY_SUMMARY)),
});
export type CompanySummary = z.infer<typeof companySummarySchema>;

/* ------------------------------------------------------------- job payloads */

export const crawlCompanyJobSchema = z.object({
  companyId: z.string().min(1),
  /** The website the crawl is for; a result for a website since replaced is dropped. */
  url: z.string().min(1),
});
export type CrawlCompanyJob = z.infer<typeof crawlCompanyJobSchema>;

export const processCompanyDocumentJobSchema = z.object({
  documentId: z.string().min(1),
});
export type ProcessCompanyDocumentJob = z.infer<
  typeof processCompanyDocumentJobSchema
>;
