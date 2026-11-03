import { DomainError } from "../../common/errors";

// The company feature's domain errors. Every code here is listed in the
// contract header of src/__tests__/company.api.test.ts.

export class CompanyWebsiteInvalidError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "COMPANY_WEBSITE_INVALID";
  constructor(url: string) {
    super(`"${url}" is not a website address`);
    this.name = "CompanyWebsiteInvalidError";
  }
}

export class CompanyWebsiteMissingError extends DomainError {
  readonly kind = "conflict";
  readonly code = "COMPANY_WEBSITE_MISSING";
  constructor() {
    super("The company has no website to crawl");
    this.name = "CompanyWebsiteMissingError";
  }
}

export class CompanyAiUnavailableError extends DomainError {
  readonly kind = "unavailable";
  readonly code = "COMPANY_AI_UNAVAILABLE";
  constructor() {
    super(
      "FIRECRAWL_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY are not set in apps/api/.env",
    );
    this.name = "CompanyAiUnavailableError";
  }
}

export class CompanyScrapeFailedError extends DomainError {
  readonly kind = "upstream";
  readonly code = "COMPANY_SCRAPE_FAILED";
  constructor(url: string, reason: string) {
    super(`Could not read ${url}: ${reason}`);
    this.name = "CompanyScrapeFailedError";
  }
}

export class CompanyDocumentTypeError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "COMPANY_DOCUMENT_TYPE";
  constructor(mimeType: string) {
    super(`A company document cannot be "${mimeType || "unknown"}"`);
    this.name = "CompanyDocumentTypeError";
  }
}

export class CompanyDocumentTooLargeError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "COMPANY_DOCUMENT_TOO_LARGE";
  constructor(max: number) {
    super(`A company document may be at most ${max} bytes`);
    this.name = "CompanyDocumentTooLargeError";
  }
}

export class CompanyDocumentUrlInvalidError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "COMPANY_DOCUMENT_URL_INVALID";
  constructor(url: string) {
    super(`${url} is not an upload of this API`);
    this.name = "CompanyDocumentUrlInvalidError";
  }
}

export class CompanyDocumentLimitError extends DomainError {
  readonly kind = "conflict";
  readonly code = "COMPANY_DOCUMENT_LIMIT";
  constructor(max: number) {
    super(`A company may have at most ${max} documents`);
    this.name = "CompanyDocumentLimitError";
  }
}

export class CompanyDocumentNotFoundError extends DomainError {
  readonly kind = "not_found";
  readonly code = "COMPANY_DOCUMENT_NOT_FOUND";
  constructor(id: string) {
    super(`Company document ${id} not found`);
    this.name = "CompanyDocumentNotFoundError";
  }
}
